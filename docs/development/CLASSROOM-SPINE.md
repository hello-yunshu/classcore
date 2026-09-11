# Authenticated Classroom Spine

Status: `implemented` for the generic authority model; reference WebSocket remains an unauthenticated transport adapter and is not product readiness evidence.

`InMemoryClassroomAuthority` models the required authority sequence: a credential is resolved against a Session, a `JoinGrant` creates a `SessionMembership`, the access token is verified before a connection context is created, and Presence records online/offline transitions with heartbeat timestamps. The authority rejects invalid credentials, ended sessions and revoked memberships.

The reference server's `x-classcore-user-id` remains a development adapter only. It must not be treated as formal authenticated classroom evidence.
