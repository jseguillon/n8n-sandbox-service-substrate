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

The image supplies Node.js, Python, system tools, and the sandbox daemon. It does
not install npm workspace dependencies or global TypeScript. The ActorTemplate
owns the dependency manifest and initialization command.

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

Enable Substrate's `GoldenEgressPolicy` preview gate on both `ate-api-server` and
`ate-controller` with `--preview=GoldenEgressPolicy`. The template's golden Actor
needs registry TLS access while it installs dependencies. Keep that flag in the
operator's deployment source. Use `kubectl ate --preview` when creating the
template because its golden egress policy is a preview field.

`ActorTemplate` is managed through the Substrate API; it is not a Kubernetes
CRD. The worker pool is a Kubernetes resource.

```bash
envsubst < substrate/worker-pool.yaml.tmpl | kubectl apply -f -
kubectl ate create atespace n8n-sandboxes
envsubst '${SUBSTRATE_SANDBOX_IMAGE}' < substrate/actor-template.yaml.tmpl \
  | kubectl ate --preview create actor-template -f -
```

Grant the n8n ServiceAccount only the role it needs in this Atespace. The
sample n8n manifest and projected token and PodIdentity files are in
[`docs/examples/`](../docs/README.md).

Wait for the template's golden snapshot before accepting traffic:

```bash
kubectl ate get actor-template n8n-sandbox -a n8n-sandboxes
```

## Template bootstrap and readiness

The template runs `/bin/sh -ec` through `command` and `args`. Its Node.js block
writes the configured package manifest, runs npm with lifecycle scripts disabled,
and validates the complete dependency tree. It writes `.n8n-runtime-ready`
atomically only after validation succeeds. The marker contains the manifest hash.
A repeated start with the same marker does not install packages or overwrite
workspace files. This also supports cold boot from a ROOTFS snapshot.

The command starts the daemon only after initialization succeeds. The v1
`wakeupProbe` then gates readiness on `/healthz`, with a 180-second bootstrap
budget. The template controller captures its golden snapshot after the Actor
becomes ready. The golden snapshot therefore contains the installed dependencies.
New Actors can use that snapshot without a separate seed tag or first-use install.

Update the manifest pins in the template when n8n's runtime dependencies change.
Create a new versioned ActorTemplate because templates are immutable. Preserve
the old template while existing Actors still depend on it. `SUBSTRATE_ACTOR_TAG`
is optional for manually prepared snapshots, but is not needed for this pattern.

## Lifecycle

An actor name is the sandbox identifier. It must be a DNS-1123 label. The
sandbox-service REST API uses UUID identifiers instead.

```bash
kubectl ate create actor workflow-42 -a n8n-sandboxes --template n8n-sandbox
kubectl ate resume actor workflow-42 -a n8n-sandboxes
kubectl ate suspend actor workflow-42 -a n8n-sandboxes --mode=async
kubectl ate delete actor workflow-42 -a n8n-sandboxes
```

When automatic suspension is enabled, n8n requests asynchronous suspension as
soon as an Actor's final command or file operation finishes, fails, or times out.
There is no pre-suspend timer. The RPC returns after the node-local checkpoint.
atelet uploads the snapshot to object storage in the background. n8n deletes
ephemeral Actors. An hourly recovery task handles missed cleanup and
applies the configured retention interval. See the
[lifecycle guide](../docs/substrate.md#actor-lifecycle) for configuration details.

See the companion n8n `docs/substrate-startup-latency.md` for the MEMORY versus
ROOTFS comparison. The template defaults to MEMORY. ROOTFS preserves filesystem
changes but does not package process memory. VOLUMES alone does not preserve the
unmounted workspace.

For other Actors, operate a trusted idle controller that calls
`suspend actor --mode=sync`. Arrange worker-drain handling before a node is
terminated. Synchronous suspension does not return until the snapshot is durable.

Deleting an Actor deletes its actor-owned snapshots. To retain state beyond an
Actor's deletion, create a tag from a synchronously suspended Actor first:

```bash
kubectl ate suspend actor workflow-42 -a n8n-sandboxes --mode=sync
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
