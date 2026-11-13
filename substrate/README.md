# Agent Substrate deployment

This directory contains the Substrate v1 WorkerPool and ActorTemplate for the
n8n sandbox daemon. Agent Substrate owns placement, isolation, snapshots, resume,
and routing. This is an additional deployment option alongside the
sandbox-service gateway and runners.

Each n8n sandbox is a Substrate Actor. Substrate places it into a gVisor worker,
restores the memory and filesystem state that a controller snapshots, and routes
a request to it through `atenet-router`.

## Prerequisites

Install Substrate v1 and `kubectl ate` by following the
[upstream installation guide](https://github.com/agent-substrate/substrate).
Configure a gVisor `SandboxConfig`, snapshot storage, and trusted Control API
authentication. Create a separate Atespace and access policy for each tenant.
Do not use a shared bootstrap owner as the tenant authorization model.

The WorkerPool namespace uses Pod Security Admission level `privileged` because
Substrate workers need hostPath access. Keep application workloads in a separate
namespace. n8n's Substrate integration records Actor activity and runs a
leader-coordinated cleanup task. Use a separate trusted controller for Actors
that n8n does not manage and for worker drains.

Encrypt snapshot data at rest. Restrict snapshot-store access to Substrate
components. Apply tenant-aware retention and deletion controls. Do not give
snapshot-store credentials to Actors.

Set both values to immutable, digest-pinned images. Use the `ateworker-gvisor`
image from the same Substrate release as the control plane. Build the sandbox
image from `Dockerfile.substrate-sandbox`.

```bash
export SUBSTRATE_WORKER_IMAGE=registry.example/ateworker-gvisor@sha256:...
export SUBSTRATE_SANDBOX_IMAGE=registry.example/n8n-sandbox@sha256:...
```

Build and publish the actor image before setting its digest:

```bash
docker buildx build --platform linux/amd64 \
  --push -f Dockerfile.substrate-sandbox \
  -t registry.example/n8n-sandbox:2026-10-19 .
```

## Deploy

`ActorTemplate` is managed through the Substrate API; it is not a Kubernetes
CRD. The worker pool is a Kubernetes resource.

```bash
envsubst < substrate/worker-pool.yaml.tmpl | kubectl apply -f -
kubectl ate create atespace n8n-sandboxes
envsubst < substrate/actor-template.yaml.tmpl | kubectl ate create actor-template -f -
```

Grant the n8n ServiceAccount only the role it needs in this Atespace. The
sample n8n manifest and projected token and PodIdentity files are in
[`docs/examples/`](../docs/README.md).

Wait for the template's golden snapshot before accepting traffic:

```bash
kubectl ate get actor-template n8n-sandbox -a n8n-sandboxes
```

## Lifecycle

An actor name is the sandbox identifier. It must be a DNS-1123 label. The
sandbox-service REST API uses UUID identifiers instead.

```bash
kubectl ate create actor workflow-42 -a n8n-sandboxes --template n8n-sandbox
kubectl ate resume actor workflow-42 -a n8n-sandboxes
kubectl ate suspend actor workflow-42 -a n8n-sandboxes --mode=sync
kubectl ate delete actor workflow-42 -a n8n-sandboxes
```

When automatic suspension is enabled, n8n starts a five-second grace period
after an Actor's final command or file operation completes. A new operation
cancels the pending suspension. n8n suspends persistent Actors synchronously and
deletes ephemeral Actors. An hourly recovery task handles missed cleanup and
applies the configured retention interval. See the
[lifecycle guide](../docs/substrate.md#actor-lifecycle) for configuration details.

For other Actors, operate a trusted idle controller that calls
`suspend actor --mode=sync`. Arrange worker-drain handling before a node is
terminated. Synchronous suspension does not return until the snapshot is durable.

Deleting an Actor deletes its actor-owned snapshots. To retain state beyond an
Actor's deletion, create a tag from a synchronously suspended Actor first:

```bash
kubectl ate create tag workflow-42-checkpoint -a n8n-sandboxes \
  --actor workflow-42
kubectl ate delete actor workflow-42 -a n8n-sandboxes
```

## Router access

The n8n client connects to `atenet-router` over HTTPS with a PodIdentity client
certificate. The router checks that certificate's SPIFFE ID against its ingress
allowlist. The `ate-target-actor` header selects an Actor; it does not authorize
the caller. Keep the router private and allow only trusted server identities.
See [the native API guide](../docs/substrate.md) for the request paths and
security model.

Substrate denies Actor DNS and outbound HTTP(S) unless an egress policy allows
them. Configure n8n's `SUBSTRATE_EGRESS_POLICY_FILE` with administrator-defined
default rules before a workspace needs package downloads. n8n copies these rules
to Actors without an existing policy and leaves existing policies unchanged.
With the setting unset, n8n creates no egress policy. See the
[default egress guide](../docs/substrate.md#default-egress-policy) for the JSON
format and update behavior.
