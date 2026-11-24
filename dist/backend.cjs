"use strict";

const minute = 60_000;
const maxActiveGap = 15 * minute;

const questionKinds = new Map([
  ["quiz", "quiz"], ["probe", "quiz"], ["ask_user_question", "ask"],
  ["explain", "explain"], ["recall", "explain"],
]);

function dayFormatter(timeZone) {
  if (typeof timeZone !== "string" || !timeZone || timeZone.length > 100) {
    throw new Error("A calendar time zone is required.");
  }
  return new Intl.DateTimeFormat("en-CA", {
    timeZone, calendar: "gregory", numberingSystem: "latn",
    year: "numeric", month: "2-digit", day: "2-digit",
  });
}

function localDay(timestamp, formatter) {
  const instant = new Date(timestamp);
  const parts = formatter.formatToParts(instant);
  const field = type => parts.find(part => part.type === type).value;
  return [field("year"), field("month"), field("day")].join("-");
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function learnerContent(content) {
  return hasText(content) || (Array.isArray(content) && content.some(block =>
    block?.type === "image" || (block?.type === "text" && hasText(block.text))));
}

function sameOccurrence(value, call) {
  return value && value.messageId === call.messageId && value.contentIndex === call.contentIndex &&
    value.toolCallId === call.toolCallId && value.toolName === call.toolName;
}

function acceptedAnswer(message, call) {
  const data = message.details;
  if (!call || call.answered || call.toolName !== message.toolName ||
      message.isError || !data || data.dismissed || !hasText(data.answeredAt)) return false;
  if (data.kind === "plugin-question") {
    const snapshot = call.snapshot;
    return snapshot && sameOccurrence(snapshot.occurrence, call) &&
      sameOccurrence(message.lhQuestionOccurrence, call) && hasText(data.questionId) &&
      data.questionId === snapshot.questionId && data.pluginId === snapshot.pluginId &&
      data.typeId === snapshot.typeId && data.contractVersion === snapshot.contractVersion &&
      Object.hasOwn(data, "answer");
  }
  return questionKinds.has(call.toolName) && data.kind === questionKinds.get(call.toolName) &&
    typeof data.questionText === "string" && typeof data.dontKnow === "boolean" && Array.isArray(data.answers);
}

// Use the native transcript. Its rendered form also gives some system events a user role.
function countSession(record, formatter, now) {
  const daily = new Map();
  const events = [];
  const seen = new Set();
  const calls = new Map();
  function count(at, category) {
    if (typeof at !== "number" && typeof at !== "string") return;
    const timestamp = new Date(at).getTime();
    if (!Number.isFinite(timestamp) || timestamp > now) return;
    const day = localDay(timestamp, formatter);
    events.push({timestamp, day});
    if (!daily.has(day)) {
      daily.set(day, {
        id: record.id, title: record.title?.trim() || "Untitled session",
        kind: record.kind === "practice" ? "practice" : "teaching",
        messages: 0, answers: 0, sideMessages: 0,
      });
    }
    daily.get(day)[category]++;
  }
  for (const message of record.messages) {
    if (!message || !hasText(message.id) || seen.has(message.id)) continue;
    seen.add(message.id);
    const data = message.details;
    if (message.role === "assistant" && Array.isArray(message.content)) {
      message.content.forEach((block, index) => {
        if (block?.type !== "toolCall" || !hasText(block.id)) return;
        calls.set(block.id, {
          messageId: message.id, contentIndex: index, toolCallId: block.id, toolName: block.name,
          snapshot: message.lhQuestions?.[index], answered: false,
        });
      });
    } else if (message.role === "user" && learnerContent(message.content)) {
      count(message.timestamp, "messages");
    } else if (message.role === "toolResult") {
      const call = calls.get(message.toolCallId);
      if (acceptedAnswer(message, call)) {
        call.answered = true;
        count(data.answeredAt, "answers");
      }
    } else if (message.role === "custom" && message.customType === "practice-thinking" &&
        hasText(data?.problemCallId) && (hasText(data.text) || data.images?.length)) {
      count(message.timestamp, "answers");
    } else if (message.role === "custom" && message.customType === "plugin-problem-submission" &&
        data?.kind === "plugin-problem-submission" && hasText(data.problemId) && Object.hasOwn(data, "submission")) {
      count(data.submittedAt, "answers");
    }
  }
  // The main transcript may contain a projection of a side question. Count only its original.
  for (const thread of record.sideChats || []) {
    for (const message of thread?.messages || []) {
      if (message?.role !== "user" || !hasText(message.id) || seen.has(message.id) || !hasText(message.text)) continue;
      seen.add(message.id);
      count(message.at, "sideMessages");
    }
  }
  return {daily, events};
}

// Credit a single timeline even when the learner alternates between sessions.
// Real gaps cross midnight in the viewer's zone; the one-minute allowance for
// an isolated action or the end of a burst belongs to its last recorded day.
function estimateLearningTime(days, events, formatter) {
  events.sort((a, b) => a.timestamp - b.timestamp);
  for (let i = 0; i < events.length; i++) {
    const current = events[i];
    const next = events[i + 1];
    const day = days.get(current.day);
    if (!next || next.timestamp - current.timestamp > maxActiveGap) {
      day.estimatedMs += minute;
    } else if (current.day === next.day) {
      day.estimatedMs += next.timestamp - current.timestamp;
    } else {
      // Find the actual date boundary, including time zones whose offset
      // changes at midnight. Local days aren't always 24 hours long.
      let lo = current.timestamp;
      let hi = next.timestamp;
      while (hi - lo > 1) {
        const mid = lo + Math.floor((hi - lo) / 2);
        if (localDay(mid, formatter) === current.day) lo = mid;
        else hi = mid;
      }
      day.estimatedMs += hi - current.timestamp;
      days.get(next.day).estimatedMs += next.timestamp - hi;
    }
  }
}

exports.activate = function activate(ctx) {
  ctx.handle("activity", input => {
    const formatter = dayFormatter(input?.timeZone);
    const days = new Map();
    const visited = new Set();
    const events = [];
    const now = Date.now();
    let skippedSessions = 0;
    for (const summary of ctx.learning.listSessions()) {
      if (visited.has(summary.id)) continue;
      visited.add(summary.id);
      let activity;
      try {
        const record = ctx.learning.getSession(summary.id);
        if (record?.id !== summary.id || !Array.isArray(record.messages)) {
          skippedSessions++;
          continue;
        }
        activity = countSession(record, formatter, now);
      } catch {
        skippedSessions++;
        continue;
      }
      for (const event of activity.events) events.push(event);
      for (const [date, session] of activity.daily) {
        if (!days.has(date)) days.set(date, {date, count: 0, estimatedMs: 0, sessions: []});
        const day = days.get(date);
        day.sessions.push(session);
        day.count += session.answers + session.messages + session.sideMessages;
      }
    }
    estimateLearningTime(days, events, formatter);
    return {days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)), skippedSessions};
  });
};
