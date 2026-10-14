/**
 * Football Auction Pro - Production Firebase Cloud Functions
 * Authoritative backend financial transactions, atomic purse management, and sale processing
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

/**
 * Validates whether the caller holds Auctioneer or Super Admin role
 */
function assertAuthorizedAuctioneer(context) {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }
  const role = context.auth.token.role;
  const email = context.auth.token.email;
  const isAuthorized = role === 'auctioneer' || role === 'super_admin' || 
    email === 'admin@footballauction.pro' || email === 'auctioneer@footballauction.pro';

  if (!isAuthorized) {
    throw new functions.https.HttpsError('permission-denied', 'Only auctioneers or admins can execute this action.');
  }
}

/**
 * 1. Callable: placeBid
 * Executes an atomic transaction to validate purse and record bid
 */
exports.placeBid = functions.https.onCall(async (data, context) => {
  assertAuthorizedAuctioneer(context);

  const { teamId, amount } = data;
  const bidAmount = Math.round(Number(amount));

  if (!teamId || isNaN(bidAmount) || bidAmount <= 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Valid teamId and integer amount required.');
  }

  const auctionStateRef = db.collection('auctionState').doc('current');
  const teamRef = db.collection('teams').doc(teamId);
  const tourneyRef = db.collection('tournament').doc('tournament_2026');

  return await db.runTransaction(async (transaction) => {
    const [auctionDoc, teamDoc, tourneyDoc] = await Promise.all([
      transaction.get(auctionStateRef),
      transaction.get(teamRef),
      transaction.get(tourneyRef)
    ]);

    if (!auctionDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Live auction state not found.');
    }
    if (!teamDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Team does not exist.');
    }

    const auctionState = auctionDoc.data();
    const team = teamDoc.data();
    const tourney = tourneyDoc.exists ? tourneyDoc.data() : { timerDuration: 30, maxSquadSize: 18 };

    if (auctionState.status !== 'LIVE' && auctionState.status !== 'PLAYER_SELECTED') {
      throw new functions.https.HttpsError('failed-precondition', 'Auction is not currently live for bids.');
    }

    // Authoritative purse verification
    if (bidAmount > team.remainingPurse) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        `Insufficient funds: ${team.name} has remaining purse of ${team.remainingPurse}, cannot bid ${bidAmount}.`
      );
    }

    // Squad size limit check
    if ((team.playersCount || 0) >= tourney.maxSquadSize) {
      throw new functions.https.HttpsError('failed-precondition', `Squad limit reached (${tourney.maxSquadSize}).`);
    }

    // Verify bid meets current minimum
    if (auctionState.highestBiddingTeam && bidAmount <= auctionState.currentBid) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        `Bid must exceed current highest bid of ${auctionState.currentBid}.`
      );
    }

    const bidRecord = {
      teamId: team.id,
      teamName: team.name,
      teamShortName: team.shortName || '',
      teamLogo: team.logo || '',
      amount: bidAmount,
      timestamp: Date.now()
    };

    const updatedHistory = [bidRecord, ...(auctionState.bidHistory || [])];

    transaction.update(auctionStateRef, {
      currentBid: bidAmount,
      highestBiddingTeam: {
        id: team.id,
        name: team.name,
        logo: team.logo,
        remainingPurse: team.remainingPurse
      },
      bidHistory: updatedHistory,
      status: 'LIVE',
      timerRunning: true,
      timerSeconds: tourney.timerDuration || 30,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    });

    // Write audit trail entry
    const auditRef = db.collection('auditLogs').doc();
    transaction.set(auditRef, {
      timestamp: new Date().toISOString(),
      action: 'BID_PLACED',
      description: `${team.name} placed bid of ${bidAmount} on ${auctionState.currentPlayer.name}`,
      performedBy: context.auth.token.email || 'Auctioneer',
      teamId,
      amount: bidAmount
    });

    return { success: true, currentBid: bidAmount, leadingTeam: team.name };
  });
});

/**
 * 2. Callable: confirmSale
 * Atomically deducts purse from winning club, marks player SOLD, updates squad
 */
exports.confirmSale = functions.https.onCall(async (data, context) => {
  assertAuthorizedAuctioneer(context);

  const auctionStateRef = db.collection('auctionState').doc('current');

  return await db.runTransaction(async (transaction) => {
    const auctionDoc = await transaction.get(auctionStateRef);
    if (!auctionDoc.exists) throw new functions.https.HttpsError('not-found', 'Auction state not found.');

    const state = auctionDoc.data();
    if (!state.currentPlayer || !state.highestBiddingTeam) {
      throw new functions.https.HttpsError('failed-precondition', 'Cannot confirm sale: No player or leading bidder.');
    }

    const teamRef = db.collection('teams').doc(state.highestBiddingTeam.id);
    const playerRef = db.collection('players').doc(state.currentPlayer.id);

    const [teamDoc, playerDoc] = await Promise.all([
      transaction.get(teamRef),
      transaction.get(playerRef)
    ]);

    if (!teamDoc.exists || !playerDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Team or player document missing.');
    }

    const team = teamDoc.data();
    const player = playerDoc.data();
    const finalAmount = Math.round(Number(state.currentBid));

    // Authoritative financial validation
    if (finalAmount > team.remainingPurse) {
      throw new functions.https.HttpsError('failed-precondition', 'Team has insufficient purse for sale confirmation.');
    }

    // Deduct Purse and update Squad
    const newRemainingPurse = team.remainingPurse - finalAmount;
    const newTotalSpent = (team.totalSpent || 0) + finalAmount;
    const updatedSquad = [...(team.squad || []), {
      id: player.id,
      name: player.name,
      position: player.position,
      price: finalAmount
    }];

    transaction.update(teamRef, {
      remainingPurse: newRemainingPurse,
      totalSpent: newTotalSpent,
      playersCount: updatedSquad.length,
      squad: updatedSquad
    });

    // Mark Player SOLD
    transaction.update(playerRef, {
      status: 'SOLD',
      finalPrice: finalAmount,
      soldToTeamId: team.id,
      soldToTeamName: team.name
    });

    // Mark Auction State SOLD
    transaction.update(auctionStateRef, {
      status: 'SOLD',
      timerRunning: false,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    });

    // Record Audit
    const auditRef = db.collection('auditLogs').doc();
    transaction.set(auditRef, {
      timestamp: new Date().toISOString(),
      action: 'PLAYER_SOLD',
      description: `CONFIRMED SALE: ${player.name} transferred to ${team.name} for ${finalAmount}`,
      performedBy: context.auth.token.email || 'Auctioneer',
      playerId: player.id,
      teamId: team.id,
      finalAmount
    });

    return { success: true, player: player.name, team: team.name, finalAmount };
  });
});

/**
 * 3. Callable: markUnsold
 * Marks player UNSOLD without any purse deductions
 */
exports.markUnsold = functions.https.onCall(async (data, context) => {
  assertAuthorizedAuctioneer(context);

  const auctionStateRef = db.collection('auctionState').doc('current');

  return await db.runTransaction(async (transaction) => {
    const auctionDoc = await transaction.get(auctionStateRef);
    if (!auctionDoc.exists) throw new functions.https.HttpsError('not-found', 'Auction state not found.');

    const state = auctionDoc.data();
    if (!state.currentPlayer) throw new functions.https.HttpsError('failed-precondition', 'No player selected.');

    const playerRef = db.collection('players').doc(state.currentPlayer.id);

    transaction.update(playerRef, {
      status: 'UNSOLD',
      finalPrice: 0,
      soldToTeamId: null,
      soldToTeamName: null
    });

    transaction.update(auctionStateRef, {
      status: 'UNSOLD',
      timerRunning: false,
      highestBiddingTeam: null,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    });

    const auditRef = db.collection('auditLogs').doc();
    transaction.set(auditRef, {
      timestamp: new Date().toISOString(),
      action: 'PLAYER_UNSOLD',
      description: `Player ${state.currentPlayer.name} passed as UNSOLD (0 purse deducted)`,
      performedBy: context.auth.token.email || 'Auctioneer'
    });

    return { success: true, player: state.currentPlayer.name };
  });
});

/**
 * 4. Callable: undoSale
 * Safely refunds club purse and rolls back sold status
 */
exports.undoSale = functions.https.onCall(async (data, context) => {
  if (!context.auth || context.auth.token.role !== 'super_admin') {
    throw new functions.https.HttpsError('permission-denied', 'Super Admin privileges required to reverse sales.');
  }

  const { playerId } = data;
  if (!playerId) throw new functions.https.HttpsError('invalid-argument', 'playerId is required.');

  const playerRef = db.collection('players').doc(playerId);

  return await db.runTransaction(async (transaction) => {
    const playerDoc = await transaction.get(playerRef);
    if (!playerDoc.exists) throw new functions.https.HttpsError('not-found', 'Player not found.');

    const player = playerDoc.data();
    if (player.status !== 'SOLD' || !player.soldToTeamId) {
      throw new functions.https.HttpsError('failed-precondition', 'Player is not in SOLD state.');
    }

    const teamRef = db.collection('teams').doc(player.soldToTeamId);
    const teamDoc = await transaction.get(teamRef);

    if (teamDoc.exists) {
      const team = teamDoc.data();
      const refundAmount = player.finalPrice || 0;
      const updatedSquad = (team.squad || []).filter(item => item.id !== playerId);

      transaction.update(teamRef, {
        remainingPurse: team.remainingPurse + refundAmount,
        totalSpent: Math.max(0, team.totalSpent - refundAmount),
        playersCount: updatedSquad.length,
        squad: updatedSquad
      });
    }

    transaction.update(playerRef, {
      status: 'AVAILABLE',
      finalPrice: 0,
      soldToTeamId: null,
      soldToTeamName: null
    });

    const auditRef = db.collection('auditLogs').doc();
    transaction.set(auditRef, {
      timestamp: new Date().toISOString(),
      action: 'SALE_REVERSED',
      description: `REVERSAL: Sale of ${player.name} refunded to team ${player.soldToTeamId}`,
      performedBy: context.auth.token.email || 'Super Admin'
    });

    return { success: true, message: `Sale of ${player.name} reversed.` };
  });
});
