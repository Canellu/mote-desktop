---
title: "Hue API v1 Resourcelinks API"
keywords:
  [
    "Hue API v1",
    "resourcelinks",
    "resource links",
    "links",
    "automation metadata",
    "create resourcelink",
    "delete resourcelink",
  ]
summary: "Reference for Hue API v1 resourcelinks, which group and label related bridge resources for applications and bridge-side automation metadata."
---

# 9\. Resourcelinks API

## 9.1. Get all resourcelinks

| URL        | /api/<username>/resourcelinks |
| ---------- | ----------------------------- |
| Method     | GET                           |
| Version    | 1.12                          |
| Permission | Whitelist                     |

### 9.1.1. Description

Gets a list of all resourcelinks that are in the bridge.

### 9.1.2. Response

Returns a list of all resourcelinks in the system.

If there are no resourcelinks in the system then the bridge will return an empty object, {}.

### 9.1.3. Sample Response

```json
{
"1": {
    "name": "Sunrise",
    "description": "Carla's wakeup experience",
    "class": 1,
    "owner": "78H56B12BAABCDEF",
    "links": ["/schedules/2", "/schedules/3",
              "/scenes/ABCD", "/scenes/EFGH", "/groups/8"]
     }
"2": {
    "name": "Holiday mode",
    (...)
     }
}
```

## 9.2. Get Resourcelinks

| URL        | /api/<username>/resourcelinks/<id> |
| ---------- | ---------------------------------- |
| Method     | GET                                |
| Version    | 1.12                               |
| Permission | Whitelist                          |

### 9.2.1. Description

Returns a resourcelink object with id matching <id> or an error [3](https://developers.meethue.com/documentation/error-messages) if <id> is not available.

### 9.2.2. Sample Response

```json
{
  "name": "Sunrise",
  "description": "Carla's wakeup experience",
  "type": "Link",
  "class": 1,
  "owner": "78H56B12BAABCDEF",
  "links": [
    "/schedules/2",
    "/schedules/3",
    "/scenes/ABCD",
    "/scences/EFGH",
    "/groups/8"
  ]
}
```

## 9.3. Create Resourcelinks

| URL        | /api/<username>/resourcelinks |
| ---------- | ----------------------------- |
| Method     | POST                          |
| Version    | 1.12                          |
| Permission | Whitelist                     |

### 9.3.1. Description

Creates a new resourcelink in the bridge and generates a unique identifier for this resourcelink.

### 9.3.2. Body

```json
{
  "name": "Sunrise",
  "description": "Carla's wakeup experience",
  "type": "Link",
  "class": 1,
  "owner": "78H56B12BAABCDEF",
  "links": [
    "/schedules/2",
    "/schedules/3",
    "/scenes/ABCD",
    "/scenes/EFGH",
    "/groups/8"
  ]
}
```

### 9.3.3. Sample Response

```json
[
  {
    "success": { "id": "3" }
  }
]
```

### 9.3.4. Notes

The following attributes are used for resourceslinks:

| Column 1    | Column 2               | Column 3                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| name        | string 1..32           | Human readable name for this resourcelink                                                                                                                                                                                                                                                                                                                                                                |
| description | string 0..64           | Human readable description of what this resourcelink does. If not specified it’s set to “”.                                                                                                                                                                                                                                                                                                              |
| type        | string                 | Not writeable and there is only 1 type: “Link”                                                                                                                                                                                                                                                                                                                                                           |
| classid     | uint16                 | Class of resourcelink given by application. The resourcelink class can be used to identify resourcelink with the same purpose, like classid 1 for wake-up, 2 for going to sleep, etc. (best practice use range 1 – 10000)                                                                                                                                                                                |
| owner       | ASCII 10…40            | Not writeable, this respresents the owner (username) of the creator of the resourcelink                                                                                                                                                                                                                                                                                                                  |
| recycle     | bool                   | When true: Resource is automatically deleted when not referenced anymore in any resource link. Only on creation of resourcelink. “false” when omitted.                                                                                                                                                                                                                                                   |
| links       | list of resource paths | References to resources which are used by this resourcelink resource. In case the referenced resource was created with “recycle”:true and no other references are present, the resourcelink resource will be automatically deleted when removed when empty.Allowed resources paths (given as ASCII String with pattern: “/<resource>/<resource id>”:LightsSensorsGroupsScenesRulesSchedulesResourceLinks |

## 9.4. Update Resourcelinks

| URL        | /api/<username>/resourcelinks/<id> |
| ---------- | ---------------------------------- |
| Method     | PUT                                |
| Version    | 1.12                               |
| Permission | Whitelist                          |

### 9.4.1. Description

Updates individual or multiple attributes of an existing resourcelink. At least one attribute has to be provided.

### 9.4.2. Sample Body

```json
{
  "name": "Sunrise",
  "description": "Carla's wakeup experience"
}
```

### 9.4.3. Sample Response

```json
{
    "success": {
        "/resourcelinks/1/name": "Sunrise"
     }
},
{
    "success": {
        "/resourcelinks/1/description": "Carla's wakeup experience"
    }
}]
```

## 9.5. Delete Resourcelinks

| URL        | /api/<username>/resourcelinks/<id> |
| ---------- | ---------------------------------- |
| Method     | DELETE                             |
| Version    | 1.12                               |
| Permission | Whitelist                          |

### 9.5.1. Description

Deletes the specified resourcelink from the bridge. When a resource is deleted in the bridge that is used in a resourcelink, it’s also removed from links in the corresponding resourcelinks. Resourcelinks which become empty due to this action are only deleted if the “recycle” flag is set to true, else they will remain in the bridge.

### 9.5.2. Response

The response details whether the resourcelink was successfully removed from the bridge.

### 9.5.3. Sample Response

```json
[
  {
    "success": "/resourcelinks/1 deleted."
  }
]
```
