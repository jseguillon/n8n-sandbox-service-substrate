# Documentation

## Getting started

| Platform | Use case | Guide |
| --- | --- | --- |
| Linux | Production, Docker runner with Sysbox isolation | [quickstart-linux.md](quickstart-linux.md) |
| Linux + KVM | Production, Firecracker runner | [quickstart-firecracker-linux.md](quickstart-firecracker-linux.md) |
| Kubernetes | Production cluster deployment (Helm) | [quickstart-k8s.md](quickstart-k8s.md) · [chart README](../charts/n8n-sandbox-service/README.md) |
| macOS | Local development, privileged containers | [quickstart-macos.md](quickstart-macos.md) |
| Agent Substrate | Native Actor deployment | [deployment package](../substrate/README.md) |

## Agent Substrate

- [Deployment package](../substrate/README.md) — actor image, WorkerPool, and ActorTemplate
- [Native Substrate API](substrate.md) — Actor lifecycle, router requests, and security requirements
- [Private registry trust](substrate-registry-trust.md) — atelet trust for private Actor image registries
- [n8n application manifest](examples/n8n-app-v1.yaml.tmpl) — token, CA, and PodIdentity projections
- [Substrate v1.0.0 generic Kubernetes patch](examples/substrate-v1.0.0-generic-k8s.patch) — removes GKE-only monitoring and credential-provider wiring
- [Substrate v1.0.0 S3 patch](examples/substrate-v1.0.0-s3.patch) and [endpoint ConfigMap](examples/substrate-v1.0.0-s3-config.yaml.tmpl) — select and configure the S3 snapshot plugin
- [Archived v0.4 test files](archive/v0.4/README.md) — reference only
- [Agent Substrate documentation](https://github.com/agent-substrate/substrate) — cluster installation, identity, egress policy, snapshots, and operations

## Reference

- [Architecture](architecture.md) — components, communication, data flows, storage
- [Security model](security-model.md) — trust boundaries, what is enforced where, non-guarantees
- [Configuration](configuration.md) — every environment variable for API, runner and daemon; metrics; disk quotas
- [REST API](API.md) — endpoint reference and error contract
- [TypeScript SDK](../sdk/README.md) — client library
- Runtime internals: [Docker/Sysbox](../internal/runner/runtime/docker/README.md) · [Firecracker](../internal/runner/runtime/firecracker.ee/README.md)

## Operations

- [Observability](observability.md) — trace ids, canonical log events, how to query them
- [mTLS on Kubernetes with cert-manager](cert-manager-k8s.md) — certificate roles and the env vars they map to
- [Debugging gRPC with grpcurl](grpcurl-debug.md)

## Development and release

- [Development guide](development.md) — building, running locally, tests, playground, SDK, formatting
- [Release process](RELEASE.md) — service and SDK release pipelines
- [Firecracker golden-build bundle](../BUNDLE.md) — tarball contract and rollout order for Firecracker hosts
- [End-to-end tests](../e2e/README.md) · [Benchmarks](../benchmarks/README.md)
