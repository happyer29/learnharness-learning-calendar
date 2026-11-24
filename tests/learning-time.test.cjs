const assert = require('node:assert/strict');
const { test } = require('node:test');
const { activate } = require('../dist/backend.cjs');

const minute = 60_000;
function user(id, timestamp) {
  return {id, role: 'user', timestamp, content: 'A recorded learner action'};
}
function session(id, messages, sideChats = []) {
  return {id, messages, sideChats, title: id};
}
function activity(sessions, timeZone = 'UTC') {
  let read;
  activate({
    handle(name, handler) { assert.equal(name, 'activity'); read = handler; },
    learning: {
      listSessions: () => sessions.map(s => ({id: s.id})),
      getSession: id => sessions.find(s => s.id === id),
    },
  });
  return read({timeZone});
}
function durations(response) {
  return response.days.map(({date, count, estimatedMs}) => [date, count, estimatedMs / minute]);
}

test('interleaved chats share one timeline; idle breaks and isolated actions get one minute each', () => {
  const first = session('teach', [
    user('3', '2024-04-07T09:15Z'), user('1','2024-04-07T09:00Z'),
    user('4','2024-04-07T14:00Z'), user('1','2024-04-07T20:00Z'),
  ]);
  const second = session('practice', [user('2','2024-04-07T09:05Z'), user('5','2024-04-08T08:00Z')]);
  const result = activity([second, first, second]);
  assert.equal(result.skippedSessions, 0);
  assert.deepEqual(durations(result), [['2024-04-07',4,17], ['2024-04-08',1,1]]);
});

test('exactly 15 minutes is active, one millisecond more starts a separate burst', () => {
  const t = Date.UTC(2024, 2, 15, 9);
  const result = activity([session('one', [user('first',t), user('duplicate-time',t),
    user('boundary',t + 15*minute), user('break',t + 30*minute + 1)])]);
  assert.deepEqual(durations(result), [['2024-03-15',4,17]]);
});

test('a study burst crosses local midnight and New Year without losing or inventing time', () => {
  const result = activity([session('a',[user('a','2023-12-31T20:55Z'), user('b','2023-12-31T21:05Z')])], 'Europe/Moscow');
  assert.deepEqual(durations(result), [['2023-12-31',1,5], ['2024-01-01',1,6]]);
  assert.equal(result.days.reduce((sum, day) => sum + day.estimatedMs, 0), 11*minute);
});
test('DST spring and fall transitions compare real elapsed instants', () => {
  const result = activity([session('dst', [
    user('spring-start','2024-03-10T06:55Z'), user('spring-end','2024-03-10T07:05Z'),
    user('fall-start','2024-11-03T05:55Z'), user('fall-end','2024-11-03T06:05Z'),
  ])], 'America/New_York');
  assert.deepEqual(durations(result), [['2024-03-10',2,11],['2024-11-03',2,11]]);
});
test('uses original side chat and accepted answer times, excluding generated work and missing timestamps', () => {
  const t=Date.UTC(2024,0,8,10);
  const record=session('qa',[
    user('start',t), {id:'proposal',role:'assistant',content:[{type:'toolCall',name:'quiz',id:'q'}],timestamp:t+22*minute},
    {id:'answer',role:'toolResult',toolCallId:'q',toolName:'quiz',timestamp:t+30*minute,
      details:{answeredAt:new Date(t+8*minute).toISOString(),kind:'quiz',questionText:'?',dontKnow:false,answers:['2']}},
    {id:'work',role:'custom',customType:'model-event',timestamp:t+16*minute},
    {id:'dismiss',role:'toolResult',toolCallId:'q',toolName:'quiz',details:{dismissed:true,answeredAt:new Date(t+18*minute).toISOString()}},
    user('bad','invalid'), user('future',Date.now()+86400000),
  ],[{messages:[{id:'side',role:'user',text:'Follow-up',at:new Date(t+11*minute).toISOString()}]}]);
  const result=activity([record]);
  assert.deepEqual(durations(result), [['2024-01-08',3,12]]);
});

test('unreadable or inactive sessions contribute no partial time', () => {
  const broken=session('broken',[user('a','2024-01-08T10:00Z')], [{messages:{invalid:true}}]);
  const result=activity([broken,session('empty',[])]);
  assert.equal(result.skippedSessions,1);
  assert.deepEqual(result.days,[]);
});
