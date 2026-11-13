# Native Substrate API

The Agent Substrate deployment option runs the sandbox daemon in a Substrate
Actor. [Agent Substrate](https://github.com/agent-substrate/substrate) manages
Actor lifecycle, isolation, snapshots, and request routing. This option uses the
native Control API and router instead of the sandbox-service REST gateway,
runners, and TypeScript SDK.

## n8n provider integration

The companion n8n provider uses the Substrate v1 Control API to manage Actors and
the router to run commands and access files. Its configuration guides are
`docs/substrate-ui-configuration.md` and
`packages/@n8n/agents/docs/substrate-sandbox.md` in the n8n source tree.

An instance administrator can configure the connection through n8n's shared
sandbox UI or the server environment. Server-mounted trust, renewable token,
router identity, and default egress files remain operator-managed.

The integration uses two identities:

- The Control API uses a bearer token. The API's configured issuer and audience
  must trust that token. An Atespace access policy grants the principal its role.
- The router uses a PodIdentity client certificate. The router checks the
  certificate's SPIFFE ID against its ingress allowlist.

Mount the token, Control API CA, and router credential files read-only. The
router URL must use HTTPS. The service account needs only the required role in
its Atespace. Do not give Actors snapshot-store credentials.

## Actor lifecycle

Use `kubectl ate` or the Substrate gRPC Control API to create, resume, suspend,
inspect, and delete Actors. An Actor is a sandbox. An Atespace is its tenant
boundary. Actor names must be DNS-1123 labels.

```sh
kubectl ate create actor workflow-42 -a n8n-sandboxes --template n8n-sandbox
kubectl ate resume actor workflow-42 -a n8n-sandboxes
kubectl ate get actor workflow-42 -a n8n-sandboxes
kubectl ate suspend actor workflow-42 -a n8n-sandboxes --mode=sync
kubectl ate delete actor workflow-42 -a n8n-sandboxes
```

n8n's Substrate integration records a separate lease for each command or file
operation. When automatic suspension is enabled, the final operation's
completion starts a grace period. The default is five seconds. A new operation
cancels the pending suspension. Set
`N8N_SUBSTRATE_SANDBOX_SUSPEND_DELAY_MS=0` for immediate suspension after the last
operation. Persistent Actors use synchronous suspension; ephemeral Actors are
deleted instead.

A leader-coordinated recovery task runs once per hour. It handles missed cleanup
using the configured auto-stop interval and deletes suspended Actors after their
retention interval. Substrate itself does not suspend Actors when they become
idle. Operate a separate trusted controller for Actors outside n8n. Use
synchronous suspension before draining a worker when you must retain memory
and filesystem state.

Deleting an Actor removes its actor-owned snapshots. To retain a checkpoint
after deletion, synchronously suspend the Actor, create a tag, then delete it:

```sh
kubectl ate create tag workflow-42-checkpoint -a n8n-sandboxes --actor workflow-42
kubectl ate delete actor workflow-42 -a n8n-sandboxes
```

## Router requests

Route daemon requests through `atenet-router` over HTTPS. Clients must present a
PodIdentity certificate that the router allows. Set this header to select an
Actor:

```text
ate-target-actor: <atespace>/<actor>
```

The header selects a route. It does not authorize the caller. The daemon exposes
these paths:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/healthz` | Readiness check |
| `POST` | `/executions` | Run a shell command; response is NDJSON |
| `GET`, `DELETE` | `/executions/{exec_id}` | Read or cancel an execution |
| `GET`, `PUT`, `POST`, `DELETE` | `/files` | List, write, append, or delete files |
| `GET` | `/files/content` | Read a file |
| `POST` | `/files/copy`, `/files/move`, `/mkdir` | File operations |
| `GET` | `/stat` | Read file metadata |

`POST /executions` accepts a JSON body:

```json
{"command":"echo hello","env":{"KEY":"value"},"workdir":"/home/user","timeout_ms":10000}
```

File paths use the `path` query parameter. `PUT /files` and `POST /files` use
raw request bodies to write or append data. Set `overwrite=false` for
create-only writes. `DELETE /files` accepts `recursive` and `force` query
parameters. Copy and move requests use JSON with `src`, `dest`, and optional
`recursive` or `overwrite` fields.

Keep `atenet-router` private. Do not expose it to untrusted clients. If a service
routes requests on behalf of users, it must authenticate each user, map that
identity to an allowed Actor, and set `ate-target-actor` itself. Never trust a
client-supplied routing header.

## Isolation and state

The `n8n-sandbox` WorkerPool targets Substrate's gVisor class. The ActorTemplate
sets each sandbox to one vCPU and 512 MiB of memory, matching the original
Sysbox runner defaults. Worker limits bound shared physical capacity. A
memory-fidelity suspend and resume preserves running process memory and the
writable filesystem.

Configure a separate Atespace and authentication policy for each tenant. Do not
treat Actor names or routing headers as authorization.

## Default egress policy

Substrate denies Actor DNS and outbound HTTP(S) unless an egress policy allows
them. A template's golden policy does not carry over to new Actors in Substrate
v1. The n8n provider has no built-in destination allowlist.

Create a server-owned JSON file with the rules that your workloads need. Mount
the file read-only in n8n and set `SUBSTRATE_EGRESS_POLICY_FILE` to its path.
Restart n8n after changing the environment variable. For npm package downloads,
the file can contain:

```json
{
  "rules": [
    {
      "tlsPassthrough": {
        "hostnames": ["registry.npmjs.org"],
        "ports": { "numbers": [443] }
      }
    }
  ]
}
```

n8n validates the file before Actor acquisition. It copies the rules into an
Actor's `default` policy before resume if no policy exists. Existing Actor
policies remain unchanged. File changes affect new Actors and Actors without a
policy; they do not update existing policies. Use the Substrate policy API or
CLI to change those policies.

The integration accepts HTTP and TLS passthrough rules with hostname lists and
either `ports.numbers` (up to 16 numbers) or `ports.all: {}`. It rejects
unsupported rule types and fields. An empty rules list permits no outbound
destinations. With the environment variable unset, n8n makes no egress-policy
calls.

For broad web access, use an HTTP rule for `*` on port 80 and a TLS passthrough
rule for `*` with `ports.all: {}`. The explicit HTTP port takes precedence.
Substrate rejects an HTTP and TLS rule with the same hostname pattern when both
select all ports. Substrate v1 policies cannot allow arbitrary TCP, UDP, TLS
without SNI, STARTTLS, or server-first protocols. Cleartext HTTP on other ports
needs an explicit HTTP rule.
