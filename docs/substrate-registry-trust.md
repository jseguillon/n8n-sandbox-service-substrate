# Private registry trust

Substrate's `atelet` pulls Actor images with Go's TLS trust store. Trusting a
registry for Kubernetes Pod image pulls does not add that CA to `atelet`.

Create a ConfigMap with the registry's public issuer CA. Use the CA certificate,
not the registry's server certificate or private key:

```sh
kubectl -n ate-system create configmap actor-registry-ca \
  --from-file=ca.crt=/secure/path/registry-issuer-ca.crt \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl -n ate-system patch daemonset atelet --type=strategic \
  --patch-file substrate/atelet-registry-trust.patch.yaml
kubectl -n ate-system rollout status daemonset/atelet --timeout=3m
```

The patch adds the CA directory to Go's root search path. It keeps the system
roots and certificate and hostname checks enabled. The DaemonSet template keeps
the mount when Pods restart. Manage this change in your installation overlay or
GitOps source so it remains after Substrate upgrades.

When the issuer CA rotates, update the ConfigMap and restart `atelet` so Go
reloads the root certificates. Registry authentication is separate from
certificate trust. Private registries also need an image credential provider
that `atelet` can use.
