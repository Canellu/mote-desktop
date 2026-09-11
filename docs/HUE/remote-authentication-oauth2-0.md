---
title: "Remote Authentication OAuth2.0"
keywords:
  [
    "OAuth 2.0",
    "remote authentication",
    "authorization code",
    "PKCE",
    "access token",
    "refresh token",
    "Hue account",
  ]
summary: "Reference for Hue remote OAuth 2.0 authentication, including authorization requests, PKCE, token exchange, refresh tokens, and authenticated remote API access."
---

# Remote Authentication OAuth2.0

The Hue system uses OAuth2.0 to allow 3rd party Hue integrations to connect to Hue system resources. As client authorization is a requirement and a user must sign-in to be granted access to the system resources, OAuth2.0 framework is used as this is the Internet’s most common standard. Philips Hue follows the strict flows of RFC’s to ensure compliance with the broadest range of clients and use of standard components. It is required clients are compliant with the OAuth2.0 specification, including the appropriate fallback scenarios in case an extension is not supported by the system.

To get access, you need to log into your developer account, select your username on the top right, click on “Remote Hue API appids”, and select “Add new Remote Hue API app”. This will grant you credentials like client id and client secret that you’ll need in the next steps. The steps for successfully authenticating your application and using the Hue Remote API successfully are described below in detail.

## Authorization Request

| URL        | https://api.meethue.com/v2/oauth2/authorize |
| ---------- | ------------------------------------------- |
| Method     | GET                                         |
| Permission | valid clientid                              |

### Description

This is the initial step in the authorization flow, in which there will be a redirect to the meethue login portal for a user to grant permissions to the resources. As query parameters a valid **clientid**, and a **response_type** should be provided. The **clientid** will be supplied by the Hue team as soon a developer is registered and accepted the terms of use. The only allowed **response_type** is “**code**“. The response will come in via a redirection to the redirect_uri which you specified the moment you registered for access. If the user approves the access request, then the response contains an authorization code (which in the next step can be exchanged for an access token) and the state parameter as query parameters. If the user does not approve the request, the response contains an error message.

### Query parameters

| Name          | Value                            | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Required    |
| ------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| client_id     | The clientid you obtain from Hue | Identifies the client that is making the request. The value passed in this parameter must exactly match the value you receive from hue. Note that the underscore is not used in the clientid name of this parameter.                                                                                                                                                                                                                                                                                   | Required    |
| response_type | code                             | The response_type value must be “code”.                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Required    |
| state         | any string                       | Provides any state that might be useful to your application upon receipt of the response. The Hue Authorization Server roundtrips this parameter, so your application receives the same value it sent. To mitigate against cross-site request forgery (CSRF), it is strongly recommended to include an anti-forgery token in the state, and confirm it in the response. One good choice for a state token is a string of 30 or so characters constructed using a high-quality random-number generator. | Recommended |
| redirect_uri  | string                           | This parameter can be omitted since Hue currently only supports one redirect uri per application. If it is included it must exactly match the one configured in your developer account, and also be included in the access token request.                                                                                                                                                                                                                                                              | Optional    |
| deviceid      | string                           | The device identifier must be a unique identifier for the app or device accessing the Hue Remote API.                                                                                                                                                                                                                                                                                                                                                                                                  | Optional    |
| devicename    | string                           | The device name should be the name of the app or device accessing the remote API. The devicename is used in the user’s “My Apps” overview in the Hue Account (visualized as: “<app name> on <devicename>”). If not present, deviceid is also used for devicename. The <app name> is the application name you provided to us the moment you requested access to the remote API.                                                                                                                         | Optional    |
| appid\*       | The appid you obtain from Hue    | Identifies the app that is making the request. The value passed in this parameter must exactly match the value you receive from hue.                                                                                                                                                                                                                                                                                                                                                                   | Optional    |

\* This parameter might be removed in the future.

### PKCE

The Hue OAUTH2 server supports the optional PKCE extension. PKCE (Proof Key for Code Exchange) is an extension to the Authorization Code flow to prevent certain attacks and to securely perform the OAuth exchange from public clients. In summary, the client generates a *code_verifier*, from which it derives a *code_challenge*. The *code_challenge* is sent with the /authorize request. After the user authenticated and granted authorization, the *authorization_code* is stored in the oAuth2.0 server with the *code_challenge*. The *code_verifier* from which the code_challenge was generated then needs to be forwarded to the oAuth server in /token.

### Example

**Sample Request:**

```http
GET https://api.meethue.com/v2/oauth2/authorize?client_id=<clientid>&response_type=code&state=<state>
```

**Sample Request with PKCE:**

```http
GET https://api.meethue.com/v2/oauth2/authorize?client_id=<clientid>&response_type=code&state=<state>&code_challenge_method=S256&code_challenge=<challenge>
```

**Sample Response:**

```text
302 Found
Location: https://<redirect-uri>?pkce=<pkce>&code=<code>&state=<state>
```

## Get Token

| URL        | https://api.meethue.com/v2/oauth2/token |
| ---------- | --------------------------------------- |
| Method     | POST                                    |
| Permission | valid authorization code                |

### Description

This endpoint is intended to exchange the code obtained in the previous section for a set of access and refresh tokens. The returned **access_token** can be used by the application to access the user’s Hue resources remotely. A valid **code** and **grant_type** parameters must be provided as form parameters. The **code** parameter is the authentication code as received at the callback uri. The **grant_type** must be “**authorization_code**“. With these two parameters you will be able to complete a *Basic* authorization flow, which we will explain in detail.

The response will contain an **access_token** and a **refresh_token**. The **access_token** will be only valid for a short time, which means that the application has to refresh the **access_token** after expiration of the **access_token**, otherwise the user has to go through the authorization step again. The expire time of the **access_token** is part of the response. The **refresh_token** has no expiration time, however at each access token refresh also a new refresh token is received and the original one is invalidated.

**Sample Request without authentication:**

```http
POST https://api.meethue.com/v2/oauth2/token
Content-Type: application/x-www-form-urlencoded
grant_type=authorization_code&code=<code>
```

**Sample Response:**

```text
401 Unauthorized
Content-Type: application/json
WWW-Authenticate: Digest realm="oauth2_client@api.meethue.com",nonce="<nonce>"
{
    "error": "invalid_client",
    "error_description": "Client authentication failed."
}
```

In this example you’ll notice that you have not received an **access_token** in response to your request, even though a valid authentication **code** was sent as a query parameter. Hue still needs to *verify that it is in fact your application* requesting the **access_token** on the user’s behalf. You will have to add an *Authorization header* to the call to /v2/oauth2/token so Hue knows it really is your application that is making the request.

We recommend using Basic Authentication with PKCE. Support for digest authentication has been deprecated.

### Basic Authentication

The Hue Remote API supports Basic authentication via both header and form parameters. For Basic, you need to send a Basic authorization header that includes your base64 encoded **clientid** and **clientsecret**. Note that by doing this you are relying on TLS/SSL encryption for hiding your **clientid** and **clientsecret**. For additional security we recommend using PKCE.

**Get token with basic authentication:**

| Location | Parameter     | Value                                                                                                                    |
| -------- | ------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Header   | Authorization | Basic <base64(clientid:clientsecret)>                                                                                    |
| Header   | Content-Type  | Must be “application/x-www-form-urlencoded”                                                                              |
| Form     | code          | The code you received in “authorization request” step. This code is only valid for about 10 minutes and 1 time use only. |
| Form     | grant_type    | Must be “authorization_code”                                                                                             |

**Sample Request:**

```http
POST /v2/oauth2/token
Authorization: Basic <base64(clientid:clientsecret)>
Content-Type: application/x-www-form-urlencoded
grant_type=authorization_code&code=<code>
```

**Sample Request with PKCE:**

```http
POST /v2/oauth2/token
Authorization: Basic <base64(clientid:clientsecret)>
Content-Type: application/x-www-form-urlencoded
grant_type=authorization_code&code=<code>&code_verifier=xxx
```

**Sample Response:**

```text
200 OK
Content-Type: application/json
{
    "access_token":"<access token>",
    "expires_in":604799,
    "refresh_token":"<refresh token>",
    "token_type":"bearer"
}
```

**Sample Request using credentials in form parameters:**
In case of basic authentication, the Hue OAuth2 server also supports receiving the client_id and client_secret in url encoded form parameters instead of Authorization header.

```http
POST /v2/oauth2/token
Content-Type: application/x-www-form-urlencoded
grant_type=authorization_code&code=<code>&client_id=<cid>&client_secret=<cs>
```

### Digest Authentication

Note: Support for digest authentication has been deprecated.

HTTP Digest authentication is based on a challenge-response handshake. In the example response above you’ll find that the Hue Remote API response contains additional information in a WWW-Authenticate header. This information can be used for constructing a Digest Authorization header.

**Requesting Challenge:**

```http
POST https://api.meethue.com/v2/oauth2/token
Content-Type: application/x-www-form-urlencoded
grant_type=authorization_code&code=<code>
```

**Requesting Challenge with PKCE:**

```http
POST https://api.meethue.com/v2/oauth2/token
Content-Type: application/x-www-form-urlencoded
grant_type=authorization_code&code=<code>&code_verifier=xxx
```

Note: This post to /v2/oauth2/token endpoint should not contain an *Authorization header* or credentials as *form parameters*.

**Response:**

```text
401 Unauthorized
WWW-Authenticate: Digest realm=”oauth2_client@api.meethue.com”,nonce=”<nonce>”
```

Note: **nonce** numbers will only stay valid for a limited period.

With this **nonce**, we now have all information we need to build a Digest header to accompany our token request. The Digest header contains a **response** variable that only your applications can build.

**Get token with digest authentication:**

HeaderContent-TypeMust be “application/x-www-form-urlencoded”

| Location | Parameter     | Value                                                                                                                               |
| -------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Header   | Authorization | Digest username=”<clientid>”, realm=”oauth2_client@api.meethue.com”, nonce=”<nonce>”, uri=”/v2/oauth2/token”, response=”<response>” |
| Form     | code          | The code you received in “authorization request” step. This code is only valid for about 10 minutes and 1 time use only.            |
| Form     | grant_type    | Must be “authorization_code”                                                                                                        |

The Digest header above consists of comma-separated parameters in one single Authorization header:

- The **username** value is the **clientid** Hue provided you with.
- The **nonce** is the value you got from the challenge.
- The **response** parameter in the Digest header is unique for every token request and must be calculated.

**Example:**

```http
POST https://api.meethue.com/v2/oauth2/token
Authorization: Digest username="<clientid>", realm="oauth2_client@api.meethue.com", nonce="<nonce>", uri="/v2/oauth2/token", response="<response>"
Content-Type: application/x-www-form-urlencoded
grant_type=authorization_code&code=<code>
```

**Example with PKCE:**

```http
POST https://api.meethue.com/v2/oauth2/token
Authorization: Digest username="<clientid>", realm="oauth2_client@api.meethue.com", nonce="<nonce>", uri="/v2/oauth2/token", response="<response>"
Content-Type: application/x-www-form-urlencoded
grant_type=authorization_code&code=<code>&code_verifier=xxx
```

#### Calculating digest response

The **response** variable in the Authorization header is calculated from a set of MD5 hashed *string concatenations*. The response is calculated as follows:

| Parameter | Value                                                  |
| --------- | ------------------------------------------------------ |
| HASH1     | MD5(“CLIENTID” + “:” + “REALM” + “:” + “CLIENTSECRET”) |
| HASH2     | MD5(“VERB” + “:” + “PATH”)                             |
| response  | MD5(HASH1 + “:” + “NONCE” + “:” + HASH2)               |

In pseudo code, this would translate into the following:

```javascript
var HASH1 = MD5("<cid>:oauth2_client@api.meethue.com:<cs>");
var HASH2 = MD5("POST:/v2/oauth2/token");
var response = MD5(HASH1 + ":" + NONCE + ":" + HASH2);
```

The values needed for performing these MD5 hashing operations should look familiar:

| Parameter    | Value                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------- |
| CLIENTID     | The clientid you have received from Hue when registering for the Hue Remote API.                        |
| REALM        | The realm provided in the challenge “401 Unauthorized” response (i.e. “oauth2_client@api.meethue.com”). |
| CLIENTSECRET | The clientsecret you have received from Hue when registering for the Hue Remote API.                    |
| VERB         | The HTTPS verb you are using to request the token (i.e. “POST”).                                        |
| PATH         | The path you are making your request to (i.e. “/v2/oauth2/token”).                                      |
| NONCE        | The nonce provided in the challenge “401 Unauthorized” response.                                        |

**Sample Response:**

```text
200 OK
Content-Type: application/json
{
    "access_token":"<access token>",
    "expires_in":"604799",
    "refresh_token":"<refresh token>",
    "token_type":"bearer"
}
```

Note: For security reasons the **nonce** provided will only be valid for a short period of time. In case you are doing all things right, but still get a 401 Unauthorized, completing this flow might take too long.

## Refresh Token

| URL        | https://api.meethue.com/v2/oauth2/token |
| ---------- | --------------------------------------- |
| Method     | POST                                    |
| Permission | valid refresh token                     |

### Description

Exchange a valid refresh token previously received with a new set of access and refresh tokens.

Similar as with requesting an **access_token**, we need to include the Basic authorization header.

Url encoded form parameters should be provided for **grant_type** (which should be set to the string “refresh_token”) and **refresh_token**.

| Location | Parameter     | Value                                       |
| -------- | ------------- | ------------------------------------------- |
| Header   | Authorization | Basic authentication                        |
| Header   | Content-Type  | Must be “application/x-www-form-urlencoded” |
| Form     | grant_type    | Must be “refresh_token”                     |
| Form     | refresh_token | The obtained refresh token                  |

**Sample Request (Basic):**

```http
POST /v2/oauth2/token
Authorization: Basic <base64(clientid:clientsecret)>
Content-type: application/x-www-form-urlencoded
grant_type=refresh_token&refresh_token=<refresh token>
```

**Sample Request (Basic using form parameters):**

```http
POST /v2/oauth2/token
Content-type: application/x-www-form-urlencoded
grant_type=refresh_token&refresh_token=<refresh token>&client_id=<cid>&client_secret=<cs>
```

**Sample Request (Digest):**
Note: Support for digest authentication has been deprecated.

```http
POST /v2/oauth2/token
Authorization: Digest username="kVWjgzqk8hayM38pAudrA6psf1ju6k0T",
realm="oauth2_client@api.meethue.com",
nonce="7b6e45de18ac4ee452ee0a0de91dbb10",
uri="/v2/oauth2/token",
response="39fcfbbea89b3cf9d0547f0c838d1e27"
Content-type: application/x-www-form-urlencoded
grant_type=refresh_token&refresh_token=<refresh token>
```

**Sample Response:**

```text
200 OK
Content-Type: application/json
{
    "access_token":"<access token>",
    "expires_in":604799,
    "refresh_token":"<refresh token>",
    "token_type":"bearer"
}
```

## Data Rate Limits

We want developers to create compelling user experiences, but we also want the Hue remote services to always be available for the users. Clients that make a large number of requests in a given period of time can impact hue services, so we apply rate limits. Rate limiting restricts the number of requests for a given time period. If you exceed the limit, you will get a response code 429 (too many request) for subsequent requests. As we learn more about client usage patterns and their impact on the hue remote service we may find it necessary to modify rate limits. We strongly encourage you to build your client apps to use the minimum number of calls required to build a compelling user experience, and to deal with the rate limit violations appropriately.
