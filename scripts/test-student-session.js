"use strict";

const crypto = require("crypto");

const TEST_STUDENT_SESSION_SECRET = "test-session-secret-with-at-least-32-characters";

function base64url(value) {
  return Buffer.from(value).toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function createToken(studentId, overrides) {
  const now = Math.floor(Date.now() / 1000);
  const payload = Object.assign({
    version: 1,
    studentId,
    issuedAt: now - 60,
    expiresAt: now + 3600
  }, overrides || {});
  const encoded = base64url(JSON.stringify(payload));
  const signature = base64url(
    crypto.createHmac("sha256", TEST_STUDENT_SESSION_SECRET).update(encoded).digest()
  );
  return `${encoded}.${signature}`;
}

function authenticatedEvent(body, studentId = "S001", tokenOverrides) {
  return {
    headers: {
      Authorization: `Bearer ${createToken(studentId, tokenOverrides)}`
    },
    body: JSON.stringify(body)
  };
}

module.exports = {
  TEST_STUDENT_SESSION_SECRET,
  createToken,
  authenticatedEvent
};
