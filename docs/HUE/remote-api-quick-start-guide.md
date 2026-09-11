---
title: "Remote API Quick Start Guide"
keywords:
  [
    "remote API",
    "quick start",
    "OAuth",
    "remote whitelist",
    "Hue account",
    "cloud access",
  ]
summary: "Quick start instructions for creating a remote Hue API whitelist entry and making authenticated remote bridge API calls."
---

# Remote API Quick start guide

Please use the instructions on [Remote API authentication](https://developers.meethue.com/develop/hue-api/remote-authentication-oauth/) to get an access_token and a refresh_token.

## To create a whitelist entry/username remotely:

Do a PUT on https://api.meethue.com/route/api/0/config with body:

```json
{ “linkbutton”:true }
```

and headers:

```text
Authorization: Bearer <access_token>
Content-Type: application/json
```

Directly after do a POST on https://api.meethue.com/route/api with body:

```json
{ “devicetype”:”<your-application-name>” }
```

and headers:

```text
Authorization: Bearer <access_token>
Content-Type: application/json
```

This last call will return the username, which you can save and use in the follow up urls:

```json
[
  {
    "success": {
      "username": “*****"
    }
  }
]
```

From now on the Remote API calls are same as [local API calls](https://developers.meethue.com/develop/hue-api/). Just the base URL is different: https://api.meethue.com/route/api/<whitelist_identifier>instead of http://<ip-address.of.the.bridge>/api/<whitelist_identifier>

I.e. to get all lights: Do a GET on https://api.meethue.com/route/api/<whitelist_identifier>/lights with Request header:

```text
Authorization: Bearer <access_token>
```

I.e. to set a light state: Do a PUT on https://api.meethue.com/route/api/<whitelist_identifier>/lights/1/state with Request headers:

```text
Authorization: Bearer <access_token>
Content-Type: application/json
```

and body:

```json
{ "on": true, "xy": [0.64394, 0.33069] }
```

More info on setting light states: [Lights API](https://developers.meethue.com/develop/lights-api/)
