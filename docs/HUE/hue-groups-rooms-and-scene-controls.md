---
title: "Hue Groups, Rooms, and Scene Controls"
keywords:
  [
    "groups",
    "rooms",
    "zones",
    "scenes",
    "group control",
    "room control",
    "scene behavior",
  ]
summary: "Design guidance explaining how Hue groups, rooms, zones, and scenes work together and how applications should present grouped and scene-based control."
---

# Hue Groups, Rooms, and Scene Controls

## Groups in Hue

The hue system has a notion of groups. Grouping of lights can be useful to execute a command for the set of lights within a group. The advantage of using group commands is that you will get a synchronous change of state of the lights within that group, and in the process, eliminate popcorn effect.

To change the state of the lights part of a group, use a PUT on the action endpoint:

`/api/<username>/groups/<id>/action`

It is possible to change the color of all lights in a group, or to recall a scene for that group.

A group can consists of different type of lights, and a light will perform the action which will fall within its capabilities, e.g. a “Dimmable Light” will not change in case the group command asks for a “xy” color change.

The hue system has the following types of groups:

- LightGroup (group 0 is a special group, i.e. all lights)
- Luminaire (created by bridge)
- LightSource (created by bridge)
- Room (with additional Class specifications)

All detailed, and latest updated, information about groups and the actions on groups can be found back in the description of the API:

add link to groups_api

Take into account:

- maximum number of groups is 64
- LightGroup 0 is a special group created by the bridge. All lights in the system are part of the LightGroup 0. This group can not be created, modified or deleted using the API.
- “Luminaire” and “LightSource” are specific groups which are created automatically by the hue bridge, and can not be created, modified or deleted using the API. These groups are created as soon a multi-source luminaire is added to the hue system, e.g. hue Beyond.
- As soon a “LightGroup” is empty, it will automatically be deleted from the bridge.
- Rooms are specific, in that a lightpoint can not be present in mutiple “Rooms”. And a “room” is not automatically deleted when it is empty.
- A scene action will only have impact on the light which are part of that group AND that are part of the lights within the scene.  A scene action for LightGroup 0 will have impact on lights part of the scene.
- A light cannot have its hue, saturation, brightness, effect, ct or xy modified when it is turned off.
- There are 3 methods available to set the color of the light – hue and saturation (hs), xy or color temperature (ct). If multiple methods are used then a priority is used: xy > ct > hs. All included parameters will be updated but the ‘colormode’ will be set using the priority system.

In case your application makes use of a room-based approach to control IoT devices in the home, it is best to re-use the rooms created using hue app gen 2.

## Scenes in Hue

There are two version of scene definitions available in the hue system.

**Version 1:**

Legacy scenes are based on hue-app/cloud access, in which information about the scenes is stored in the hue-app and are synchronised with the cloud as soon a user is registered to a meethue.com account. Only the list of light ID’s part of the scene is stored in the bridge.  It is not recommended to use version 1 scenes:

- the name of the scenes stored does not reflect the name of the scene as visualized in the hue app.
- Old scenes no longer being used (in the hue app) are still visual using the API.
- The scene information only contains a list of light ID’s part of the scene. No information on the individual light state is stored.
- It is not possible to delete scenes.

**Version 2:**

Information stored in the hue bridge is more consistent and contains the individual light state of that scene.

As soon the scene identifier of a scenes is known (GET /api/newdeveloper/scenes) it is possible to get the details of that scene by using:

`GET /api/newdeveloper/scenes/XXavfRCcLoXXHPV`

in which `XXavfRCcLoXXHPV` is the scene identifier, and the GET will return for example:

```json
{
  "name": "Savanna sunset",
  "lights": ["2", "3"],
  "owner": "none",
  "recycle": false,
  "locked": false,
  "appdata": {
    "version": 1,
    "data": "EXXmr_r09_d15"
  },
  "picture": "",
  "lastupdated": "2016-04-08T12:01:09",
  "version": 2,
  "lightstates": {
    "2": {
      "on": true,
      "bri": 199,
      "xy": [0.6409, 0.3332]
    },
    "3": {
      "on": true,
      "bri": 199,
      "xy": [0.6409, 0.3332]
    }
  }
}
```

As you can clearly see, it returns that light 2 and 3 are part of the scenes, and it includes the lightstate of these lights.

More API calls (create, delete, ..) can be found back in: Add link to scene here

hue app gen 2 uses rooms and scenes which are linked to rooms. When creating rooms in the hue app, it will automatically create some default scenes, but the user is also able to create his own scenes. Currently, the app will link the scenes with groups/rooms by filling in the data field in the appdate part of the scene information.

The scene can be recalled by sending a PUT to the action endpoint of a group, and all lights part of that scene will be updated. One can do that for the group linked to the scene, but it is also possible to PUT the scene action on group 0. In case of group 0, all lights within the scene will be updated. In case of a specfic group (e.g. room), the lights in that specific group/room will be updated. It is possible to modify the lightstate of the lights that are part of the light scene using `PUT` on `/api/newdeveloper/scenes/<scene id>/lightstates/<id>`

When using scenes, please take into account:

- Scenes will have a recycle flag. Version 1 scenes will automatically get the flag set to true, meaning that they will be recycled as soon the number of scenes has reached its maximum in the bridge
-  As soon as a scene created (POST) takes place, each individual light, part of the light list during the creation, the hue bridge will store its light settings under the scene identifier returned to the application.
- Adding lights to a scene. Please visit Scene API for more info: Add link to modify scene
- Best practice is to use only version 2 scenes and reycle flags set to false.
- Currently data in appdata is used to link scenes to rooms, but this will be depricated in the future, then resource links will be used.
