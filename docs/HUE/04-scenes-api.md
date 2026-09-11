---
title: "Hue API v1 Scenes API"
keywords:
  [
    "Hue API v1",
    "scenes",
    "lightstates",
    "recall scenes",
    "create scene",
    "modify scene",
    "delete scene",
  ]
summary: "Reference for Hue API v1 scene endpoints covering scene listing, creation, modification, deletion, light state storage, and scene recall behavior."
---

# 4\. Scenes API

## 4.1. Get all scenes

| Field      | Value                  |
| ---------- | ---------------------- |
| URL        | /api/<username>/scenes |
| Method     | GET                    |
| Version    | 1.1                    |
| Permission | Whitelist              |

### 4.1.1. Description

Gets a list of all scenes currently stored in the bridge. Scenes are represented by a scene id, a name and a list of lights which are part of the scene. The name resource can contain a “friendly name” or can contain a unique code.  Scenes are stored in the bridge.  This means that scene light state settings can easily be retrieved by developers (using ADD link) and shown in their respective UI’s. Cached scenes (scenes stored with `PUT`) are deprecated.

### 4.1.2. Response

Returns a list of all scenes in the bridge.

If there are no scenes in the system then the bridge will return an empty object, {}.

| Name        | Type                                   | API                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <id>        | string 1..16                           | 1.1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | The id of the scene being modified or created.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| name        | string 1..16 in 1.1. 1..32 as from 1.4 | 1.1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Human readable name of the scene. Is set to <id> if omitted on creation.                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| type        | string                                 | 1.28                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Type of the scene.If not provided on creation a “LightScene” is created. Supported types:                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| LightScene  | 1.28                                   | Default                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| GroupScene  | 1.28                                   | Represents a scene which links to a specific group. While creating a new GroupScene, the group attribute shall be provided.The lights array is a read-only attribute, it cannot be modified, and shall not be provided upon GroupScene creation.When lights in a group is changed, the GroupScenes associated to this group will be automatically updated with the new list of lights in the group. The new lights added to the group will be assigned with default states for associated GroupScenes.When a group is deleted or becomes empty, all the GroupScenes associated to the group will be deleted automatically. |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| group       | string                                 | 1.28                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | group ID that a scene is linked to.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| lights      | list of int16                          | 1.1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | The light ids which are in the scene. This array can empty. As of 1.11 it must contain at least 1 element. If an invalid lights resource is given, error 7 is returned and the scene is not created. When writing, lightstate of all lights in list will be overwritten with current light state. As of 1.15 when writing, lightstate of lights which are not yet in list will be created with current light state.The array is informational for GroupScene, it is generated automatically from the lights in the linked group. |
| owner       | string 10, 40                          | 1.11                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Whitelist user that created or modified the content of the scene. Note that changing name does not change the owner.                                                                                                                                                                                                                                                                                                                                                                                                             |
| recycle     | bool                                   | 1.11                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Indicates whether the scene can be automatically deleted by the bridge. Only available by POST Set to ‘false’ when omitted. Legacy scenes created by PUT are defaulted to true. When set to ‘false’ the bridge keeps the scene until deleted by an application.                                                                                                                                                                                                                                                                  |
| locked      | bool                                   | 1.11                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Indicates that the scene is locked by a rule or a schedule and cannot be deleted until all resources requiring or that reference the scene are deleted.                                                                                                                                                                                                                                                                                                                                                                          |
| appdata     | object                                 | 1.11                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | App specific data linked to the scene. Each individual application should take responsibility for the data written in this field. Deprecated.                                                                                                                                                                                                                                                                                                                                                                                    |
| picture     | string 0..16                           | 1.11                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Only available on a GET of an individual scene resource (/api/<username>/scenes/<id>). Not available for scenes created via a PUT. Reserved for future use. Deprecated.                                                                                                                                                                                                                                                                                                                                                          |
| image       | UUID                                   | 1.36                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Unique ID for an image representing the scene. Only available for scenes create from Signify images by Hue application.                                                                                                                                                                                                                                                                                                                                                                                                          |
| lastupdated | time                                   | 1.11                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | UTC time the scene has been created or has been updated by a PUT. Will be null when unknown (legacy scenes).                                                                                                                                                                                                                                                                                                                                                                                                                     |
| version     | int                                    | 1.11                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Version of scene document:1 – Scene created via PUT, lightstates will be empty.2 – Scene created via POST lightstates available.                                                                                                                                                                                                                                                                                                                                                                                                 |

/scenes/appdata returns:

| Column 1 | Column 2     | Column 3                                                                                                      |
| -------- | ------------ | ------------------------------------------------------------------------------------------------------------- |
| Name     | Type         | Discription                                                                                                   |
| version  | int8         | App specific version of the data field. App should take versioning into account when parsing the data string. |
| data     | string 1..16 | App specific data. Free format string.                                                                        |

### 4.1.3. Sample Response

```json
{
  "4e1c6b20e-on-0": {
    "name": "Kathy on 1449133269486",
    "lights": ["2", "3"],
    "owner": "ffffffffe0341b1b376a2389376a2389",
    "recycle": true,
    "locked": false,
    "appdata": {},
    "picture": "",
    "lastupdated": "2015-12-03T08:57:13",
    "version": 1
  },
  "3T2SvsxvwteNNys": {
    "name": "Cozy dinner",
    "lights": ["1", "2"],
    "owner": "ffffffffe0341b1b376a2389376a2389",
    "recycle": true,
    "locked": false,
    "appdata": {
      "version": 1,
      "data": "myAppData"
    },
    "picture": "",
    "lastupdated": "2015-12-03T10:09:22",
    "version": 2
  }
}
```

### 4.1.4. Notes

Note that the Active field indicates that the scene was successfully created and can be used. Lightstates are returned when you get a specific scene (but not for getting all scenes). See ADD 4.6 GET SCENE for an example.

## 4.2. Create Scene

| Field      | Value                          |
| ---------- | ------------------------------ |
| URL        | /api/<username>/scenes         |
| Method     | POST                           |
| Version    | 1.111.29 – lightstates support |
| Permission | Whitelist                      |

### Sample Body

```json
{
    “name”:”Cozy dinner”,
    “recycle”:false,
    “group”:”2”,
    “type”:”GroupScene”
}
Or
{
    “name”:”Cozy dinner”,
    “recycle”:false,
    “lights”:[“1”,”2”],
    “type”:”LightScene”
}
Or
{
  "name": "awesomescene",
   "lights": ["1", "2"],
   "appdata": {
       "version": 2,
       "data": "Abc12_01_d00"
   },
   "lightstates": {
       "1": {
           "on": false,
           "bri": 100,
           "xy": [0.3, 0.2],
       },
       "2": {
           "on": false,
           "bri": 100,
            "xy": [0.3, 0.2],
            "effect": "colorloop",
       }
   }
}
```

4.2.1. Description

Creates the given scene with all lights in the provided lights resource. For a given scene the current light settings of the given lights resources are stored. If the scene id is recalled in the future, these light settings will be reproduced on these lamps. If an existing scene id is used then the settings for this scene will be overwritten and the light states resaved. The bridge can support up to 200 scenes, however please also note there is a maximum of 2048 scene lightstates so for example, of all your scenes have 20 lightstates, the maximum number of allowed scenes will be 102.

### 4.2.2. Sample Body

```json
{ "name": "Romantic dinner", "lights": ["1", "2"], "recycle": true }
```

Note that you can also create scenes with a transition time which will be used when the scene is recalled. e.g.

```json
{
  "name": "Romantic dinner",
  "lights": ["1", "2"],
  "recycle": true,
  "transitiontime": 50
}
```

You can also create scenes with appdata, picture and recycle. e.g.

```json
{
  "lights": ["3", "2", "5"],
  "recycle": true,
  "name": "My Scene",
  "appdata": { "data": "My App Data", "version": 1 },
  "picture": "ABC123DEF456"
}
```

### 4.2.3. Response

A response to a successful `PUT` contains the addresses of affected resources.
A response to a successful `POST` contains the id of the newly created scene.

### 4.2.4. Sample Response

Note: Response from `PUT`

```json
[
  {
    "success": {
      "address": "/scenes/ab341ef24/name",
      "value": "Romantic dinner"
    }
  },
  { "success": { "address": "/scenes/ab3C41ef24/lights", "value": ["1", "2"] } }
]
```

## 4.3. Modify Scene

| Field      | Value                                        |
| ---------- | -------------------------------------------- |
| URL        | /api/<username>/scenes/<id>/lightstates/<id> |
| Method     | PUT                                          |
| Version    | 1.11.29 – lightstates supported              |
| Permission | Whitelist                                    |

### Sample Body

```json
{ “name”:”Cozy dinner”, “lights”:[“1”,”2”]}
Or
{
   "name": "awesomescene",
   "lightstates": {
       "1": {
           "on": true,
           "bri": 100,
           "xy": [0.3, 0.2],
       },
       "2": {
           "on": true,
            "bri": 100,
            "xy": [0.3, 0.2],
       }
   }
}
```

### Sample Response

```json
[
 {"success":{ "/scenes/ab341ef24/name":"Cozy dinner"}},
 {"success":{"/scenes/ab341ef24/lights":[ "1 ","2"]}}
]
Or
{
  {"success":{"/scenes/ab341ef24/name":"awesomescene"}},
  {"success":
     {"/scenes/<sceneId>/lightstates/<lightId-1>/<attr>": <value>}
  },
  {  ...etc success messages for <lightId-1>... }
}
```

4.3.1. Description

Modifies or creates a new scene. The lightstates are stored in the bridge. The list of lights associated with the scene were specified when the scene was created.

### 4.3.2. Body arguments

For modifying light states you can use:

| Column 1       | Column 2             | Column 3                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name           | Type                 | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| on             | bool                 | On/Off state of the light. On=true, Off=false                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| bri            | uint8                | The brightness value to set the light to. Brightness is a scale from 0 (the minimum the light is capable of) to 254 (the maximum). Note: a brightness of 0 is not off.e.g. “brightness”: 60 will set the light to a specific brightness                                                                                                                                                                                                                                                                              |
| hue            | uint16               | The hue value to set light to. The hue value is a wrapping value between 0 and 65535. Both 0 and 65535 are red, 25500 is green and 46920 is blue.e.g. “hue”: 50000 will set the light to a specific hue.hue has to be set together with sat (setting only hue is deprecated)                                                                                                                                                                                                                                         |
| sat            | uint8                | Saturation of the light. 254 is the most saturated (colored) and 0 is the least saturated (white). sat has to be set together with sat (setting only sat is deprecated)                                                                                                                                                                                                                                                                                                                                              |
| xy             | list 2..2 of float 4 | The x and y coordinates of a color in CIE color space. The first entry is the x coordinate and the second entry is the y coordinate. Both x and y must be between 0 and 1.If the specified coordinates are not in the CIE color space, the closest color to the coordinates will be chosen.                                                                                                                                                                                                                          |
| ct             | uint16               | The Mired Color temperature of the light. 2012 connected lights are capable of 153 (6500K) to 500 (2000K).                                                                                                                                                                                                                                                                                                                                                                                                           |
| effect         | string               | The dynamic effect of the light. Currently “none” and “colorloop” are supported. Other values will generate an error of type 7.Setting the effect to colorloop will cycle through all hues using the current brightness and saturation settings. Deprecated.                                                                                                                                                                                                                                                         |
| transitiontime | uint16               | The duration of the transition from the light’s current state to the new state. This is given as a multiple of 100ms and defaults to 4 (400ms). For example, setting transitiontime:10 will make the transition last 1 second.As of 1.36 transitiontime can be used in combination of “scene” attribute. This causes it to be recalled with the given transition time. If used in combination with multiple attributes, transitiontime is applied to all attributes supporting it (on, bri, xy, hue, sat, ct, scene) |

For modifying scene name/lights:

| Column 1        | Column 2     | Column 3                                                                                                                                                                                                               | Column 4 |
| --------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Name            | Type         | Description                                                                                                                                                                                                            |          |
| name            | string 1..32 | Human readable name of the scene. Can be modified without the light list.                                                                                                                                              | Optional |
| lights          | array        | The light identifiers to update. If an invalid light identifier is given an error is returned and the scene is not updated.                                                                                            | Optional |
| lightstates     | resource     | -Only returned on GET of individual scene resource (/api/<username>/scenes/<id>).-Not returned on /api/<username> or /api/<username>/scenes/-Not available for scenes created via PUT (e.g. lightstates will be empty) | Optional |
| storelightstate | bool         | If set, the lightstates of the lights in the scene will be overwritten by the current state of the lights. Can also be used in combination with transitiontime to update the transition time of a scene.               | Optional |

### 4.3.3. Sample Body

To change the Scene LightStates use:

```json
{ "on": true, "ct": 200 }
```

To change the Scene Name or Light IDs (and updating the lights to their current values) use:

```json
{ "name": "Cozy dinner", "lights": ["3", "2"], "storelightstate": true }
```

### 4.3.4. Response

A response to a successful `PUT`

### 4.3.5. Sample Response

For changing scene lightstate attributes:

```json
[
  {
    "success": {
      "address": "/scenes/ab341ef24/lights/1/state/on",
      "value": true
    }
  },
  {
    "success": {
      "address": "/scenes/ab341ef24/lights/1/state/ct",
      "value": 200
    }
  }
]
```

For changing scene name and lights (and lightstates to current values):

```json
[
  {
    "success": {
      "/scenes/74bc26d5f-on-0/name": "Cozy dinner"
    }
  },
  {
    "success": {
      "/scenes/74bc26d5f-on-0/storelightstate": true
    }
  },
  {
    "success": {
      "/scenes/74bc26d5f-on-0/lights": ["2", "3"]
    }
  }
]
```

## 4.4. Recall a scene

To recall an existing scene you use the Groups API. Check out the Groups API for more details.

## 4.5. Delete scene

| Field      | Value                       |
| ---------- | --------------------------- |
| URL        | /api/<username>/scenes/<id> |
| Method     | DELETE                      |
| Version    | 1.11                        |
| Permission | Whitelist                   |

### 4.5.1 Description

Deletes a scene from the bridge.

For Version 1 scenes (scenes created with `PUT`) or Version 2 scenes (scenes created with `POST` with the recycle flag set to true and locked to false) when the maximum number of scenes has been reached the scene which has been used the least is recycled.

### 4.5.2 Sample Response

```json
[{ "success": "/scenes/3T2SvsxvwteNNys deleted" }]
```

## 4.6. Get Scene

| Field      | Value                       |
| ---------- | --------------------------- |
| URL        | /api/<username>/scenes/<id> |
| Method     | GET                         |
| Version    | 1.11                        |
| Permission | Whitelist                   |

### 4.6.1 Description

Gets the attributes of a given scene. As mentioned above, please note that lightstates are displayed when an individual scene is retrieved (but not for all scenes).

/scenes/<id> returns:

| Column 1 | Column 2   | Column 3                                                                                                                                                                                  |
| -------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name     | Type       | Description                                                                                                                                                                               |
| id       | int        | The light identifier                                                                                                                                                                      |
| data     | lightstate | he light state that corresponds to the given light id. A lightstate can contain up to one color attribute (XY, HS, or CT) and optionally brightness (bri), on, effect and transitiontime. |

### 4.6.2 Sample Response

```json
{
  "name": "Cozy dinner",
  "lights": ["1"],
  "owner": "newdeveloper",
  "recycle": true,
  "locked": false,
  "appdata": {},
  "picture": "",
  "lastupdated": "2015-12-03T10:09:22",
  "version": 2,
  "lightstates": {
    "1": {
      "on": true,
      "bri": 237,
      "xy": [0.5806, 0.3903]
    }
  }
}
```
