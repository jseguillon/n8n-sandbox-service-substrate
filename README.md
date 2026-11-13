# n8n Sandbox Service

Isolated, on-demand execution environments behind a REST API. Each sandbox is a container (Docker/Sysbox runner) or a Firecracker microVM, with a small HTTP daemon inside that runs commands and handles files. Runners register with a central API, which places sandboxes and proxies requests to them.

The same daemon can also run in an [Agent Substrate](https://github.com/agent-substrate/substrate)
Actor. In this deployment option, Substrate manages placement, isolation,
snapshots, resume, and routing.

## Get started

| I want to… | Read |
| --- | --- |
| Run it on a Linux host with Sysbox | [docs/quickstart-linux.md](docs/quickstart-linux.md) |
| Run the Firecracker runner on a KVM host | [docs/quickstart-firecracker-linux.md](docs/quickstart-firecracker-linux.md) |
| Develop on macOS | [docs/quickstart-macos.md](docs/quickstart-macos.md) |
| Deploy to Kubernetes | [docs/quickstart-k8s.md](docs/quickstart-k8s.md) |
| Run the daemon on Agent Substrate | [substrate/README.md](substrate/README.md) |
| Call the API | [docs/API.md](docs/API.md) · [TypeScript SDK](sdk/README.md) |
| Build and test | [docs/development.md](docs/development.md) |

The full index, including architecture, security model, configuration, operations and release process, is in [docs/README.md](docs/README.md).

## Agent Substrate option

1. Install Agent Substrate v1 on Kubernetes. Review its identity, snapshot storage,
   and network-policy requirements first.
2. Build `Dockerfile.substrate-sandbox` and publish the image by digest, or use
   a compatible image by digest.
3. Deploy the [Substrate WorkerPool and ActorTemplate](substrate/README.md).
4. Create and route Actors through the [native Substrate API](docs/substrate.md).

The current deployment templates use the Substrate v1 API. See
[`docs/examples/`](docs/README.md) for the n8n application manifest and optional
generic Kubernetes and S3 compatibility patches for Substrate v1.0.0.

The Substrate option uses the native Control API and router instead of the
sandbox-service gateway, runners, and SDK. Those components remain available
for the other deployment options.

## License

Source under the [Sustainable Use License](LICENSE.md). Files and directories with `.ee` in the name are under the [n8n Enterprise License](LICENSE_EE.md).
