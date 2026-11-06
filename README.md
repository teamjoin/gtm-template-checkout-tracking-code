# Join Stories - Checkout Tracking Code GTM Template

A Google Tag Manager template for implementing Join Stories' global script functionality. This template enables checkout tracking capabilities for your website.

## Overview

This template provides an easy way to implement Join Stories' tracking functionality through Google Tag Manager.

## Installation

1. In your Google Tag Manager account, navigate to the Templates section
2. Click on "New" to create a new template
3. Import this template file
4. Configure the template settings as needed
5. Save and publish your changes

## Global script readiness

Load the JOIN global script on the order confirmation page. If the checkout tag fires first, it checks for `JoinStories.sendCartValidated` every 100 ms for up to five seconds. It sends the checkout once when the method becomes available. If the method stays unavailable, the tag reports failure.

Keep tag sequencing enabled. The wait handles delayed initialization; it cannot replace a missing or blocked global script. Avoid firing a second checkout tag for the same purchase.

## Tests

Run the regression tests with Node.js 24 or later. No dependencies are required.

```sh
node --test tests/checkout.test.cjs
```

## Documentation

For detailed documentation and setup instructions, visit our [help center](https://help.join-stories.com).

## Support

For support and questions, please visit our [website](https://join-stories.com) or contact our support team.

## License

This template is licensed under the terms included in the LICENSE file.

## Terms of Service

By using this template, you agree to Google Tag Manager's Community Template Gallery Developer Terms of Service available at [https://developers.google.com/tag-manager/gallery-tos](https://developers.google.com/tag-manager/gallery-tos).
