# n8n Sandbox Service

Isolated, stateful execution environments on [Agent Substrate](https://github.com/agent-substrate/substrate).
Each sandbox is a Substrate Actor in a gVisor sandbox. Agent Substrate owns
placement, isolation, snapshots, resume, and routing; an operator-owned
controller decides when to suspend idle actors. This repository supplies the
unprivileged sandbox actor image and its deployment definitions.

## Get started

1. Install Agent Substrate on Kubernetes using its upstream quickstart.
2. Build the actor image from `Dockerfile.substrate-sandbox` and publish it by digest.
3. Deploy the [Substrate worker pool and actor template](substrate/README.md).
4. Create and route to Actors using the [native Substrate API](docs/substrate.md).

The retired self-hosted API, runner, and SDK are retained in the repository only
as migration reference and are not part of the Substrate deployment.

## License

Source under the [Sustainable Use License](LICENSE.md). Files and directories with `.ee` in the name are under the [n8n Enterprise License](LICENSE_EE.md).
