const {onCall, HttpsError} = require('firebase-functions/v2/https');
const {setGlobalOptions} = require('firebase-functions/v2');
const {initializeApp} = require('firebase-admin/app');
const {getFirestore, Timestamp, FieldValue} = require('firebase-admin/firestore');

initializeApp();
setGlobalOptions({region: 'asia-southeast1', maxInstances: 10});
const db = getFirestore();

function localParts(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).formatToParts(date);
  return Object.fromEntries(parts.filter(x => x.type !== 'literal').map(x => [x.type, x.value]));
}
function dayKey(date) { const p = localParts(date); return `${p.year}-${p.month}-${p.day}`; }
function minutes(date) { const p = localParts(date); return Number(p.hour) * 60 + Number(p.minute); }
function mustAuth(request) { if (!request.auth) throw new HttpsError('unauthenticated', 'Please sign in with Google first.'); }

exports.createBooking = onCall(async (request) => {
  mustAuth(request);
  const {roomId, purpose, attendees, startAt, endAt} = request.data || {};
  const start = new Date(startAt), end = new Date(endAt);
  if (!roomId || typeof purpose !== 'string' || purpose.trim().length < 2 || purpose.trim().length > 120) throw new HttpsError('invalid-argument', 'Enter a meeting purpose between 2 and 120 characters.');
  if (!Number.isInteger(attendees) || attendees < 1 || isNaN(start) || isNaN(end) || end <= start) throw new HttpsError('invalid-argument', 'Enter valid booking details.');
  if (start <= new Date()) throw new HttpsError('invalid-argument', 'Past time slots cannot be booked.');
  if (dayKey(start) !== dayKey(end) || minutes(start) < 480 || minutes(end) > 1140 || minutes(start) % 30 || minutes(end) % 30 || end - start > 4 * 60 * 60 * 1000) throw new HttpsError('invalid-argument', 'Bookings must be on one day, from 8:00 AM to 7:00 PM, in 30-minute slots, for up to 4 hours.');
  const roomRef = db.collection('rooms').doc(roomId), bookingRef = db.collection('bookings').doc();
  await db.runTransaction(async tx => {
    const room = await tx.get(roomRef);
    if (!room.exists || room.data().active !== true) throw new HttpsError('not-found', 'This room is unavailable.');
    if (attendees > room.data().capacity) throw new HttpsError('invalid-argument', 'Attendees exceed room capacity.');
    const existing = await tx.get(db.collection('bookings').where('roomId', '==', roomId).where('dayKey', '==', dayKey(start)).where('status', '==', 'confirmed'));
    for (const doc of existing.docs) { const b = doc.data(); if (start < b.endAt.toDate() && end > b.startAt.toDate()) throw new HttpsError('already-exists', 'This time is already booked. Please choose another slot.'); }
    tx.set(bookingRef, {roomId, dayKey: dayKey(start), purpose: purpose.trim(), attendees, startAt: Timestamp.fromDate(start), endAt: Timestamp.fromDate(end), userId: request.auth.uid, bookedByName: request.auth.token.name || request.auth.token.email, bookedByEmail: request.auth.token.email || '', status: 'confirmed', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
  });
  return {id: bookingRef.id};
});

exports.cancelBooking = onCall(async (request) => {
  mustAuth(request);
  const {bookingId} = request.data || {};
  if (!bookingId) throw new HttpsError('invalid-argument', 'Booking ID is required.');
  const ref = db.collection('bookings').doc(bookingId);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data().status !== 'confirmed') throw new HttpsError('not-found', 'Booking was not found.');
    if (snap.data().userId !== request.auth.uid && request.auth.token.admin !== true) throw new HttpsError('permission-denied', 'You cannot cancel this booking.');
    tx.update(ref, {status: 'cancelled', cancelledAt: FieldValue.serverTimestamp(), cancelledBy: request.auth.uid, updatedAt: FieldValue.serverTimestamp()});
  });
  return {ok: true};
});
