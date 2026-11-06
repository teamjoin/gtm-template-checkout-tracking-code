# Test the checkout templates in native GTM

This page uses the actual JOIN global-script bundle, a real GTM Web container, and a local HTTP analytics collector. It contains no GTM API adapters, copied GTM runtime, or JavaScript evaluation of the template source. All purchases and product data are synthetic. JOIN analytics go only to the local collector.

## Prepare and start

Build the global script from your Studio checkout:

```sh
pnpm widget build-global-script
```

From this repository, prepare the page with the absolute path of that checkout:

```sh
node test-site/prepare.mjs /absolute/path/to/studio
node test-site/serve.mjs
```

Open http://localhost:8380/. Generated bundles and template downloads are ignored by Git. `provenance.json` records their source revisions and SHA-256 hashes. The original template is pinned to its published gallery version.

## Configure a test GTM container

Use a separate Web container with no production tags. Keep changes in Preview; do not publish them to a merchant container.

1. Import `original.tpl` and `fixed.tpl` from the page's download links as two separate custom tag templates. Give them distinct names.
2. Check the corrected template's permissions. It reads `JoinStories.sendCartValidated` and `joinStories.globalScript.loaded`, and executes `JoinStories.sendCartValidated`. Scheduling uses GTM’s native `callLater` API.
3. Create Data Layer Variables, version 2, for `ecommerce.transaction_id` and `ecommerce.items`.
4. Create one tag with each template. Set transaction ID to the transaction variable, products to the items variable, total base amount to `29`, total final amount to `29`, and currency to `EUR`. Leave mapping keys empty to use the existing GA4 fallback.
5. Give the original tag a Custom Event trigger named `qa_checkout_original`. Give the corrected tag a Custom Event trigger named `qa_checkout_fixed`.
6. Preview the container on http://localhost:8380/. Enter its `GTM-...` ID on the page and connect it.

The HTML page controls JOIN loading for each scenario. No setup tag should load JOIN in the test container; it would bypass the delayed and missing scenarios.

## Run the comparison

Click New test before each run. Check both the page and the tag's completion status in Tag Assistant. The actual batcher can wait ten seconds before the HTTP collector receives its events.

| Scenario | Original template | Corrected template |
| --- | --- | --- |
| Analytics already initialized | Success, one cart-sell and one product-sell | Same |
| Global script delayed by one second | Missing-method failure, no sale | Success after initialization, one cart-sell and one product-sell |
| Controller exists before delayed analytics | Can report success but lose the sale | Waits for analytics, then records one sale |
| Global script absent | Immediate failure, no sale | Failure after about five seconds, no sale |

A successful synthetic purchase must produce one `cart-sell` and one `product-sell` with the same analytics transaction ID, including in the collector's HTTP results. Do not treat GTM's Success status alone as evidence of a recorded sale.

The Direct JOIN diagnostic button independently checks the actual global script and local collector. It bypasses GTM and is explicitly not a template test.

These tests establish native GTM compatibility and behavior under controlled loading conditions. They cannot establish the original cause on a merchant's confirmation page.
