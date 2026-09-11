---
title: "Hue API v1 Schedules API"
keywords:
  [
    "Hue API v1",
    "schedules",
    "timers",
    "alarms",
    "recurrence",
    "scheduled commands",
    "time patterns",
  ]
summary: "Reference for Hue API v1 schedule endpoints, including creating, retrieving, updating, and deleting scheduled commands and timer-based actions."
---

# 3\. Schedules API

## 3.1. Get all schedules

| Field      | Value                     |
| ---------- | ------------------------- |
| URL        | /api/<username>/schedules |
| Method     | GET                       |
| Version    | 1.0                       |
| Permission | Whitelist                 |

### 3.1.1. Description

Gets a list of all schedules that have been added to the bridge.

### 3.1.2. Response

Returns a list of all schedules in the system.

If there are no schedules in the system then the bridge will return an empty object, {}.

### 3.1.3. Sample Response

```json
{
  "1": {
    "name": "Timer",
    "description": "",
    "command": {
      "address": "/api/s95jtYH8HUVWNkCO/groups/0/action",
      "body": {
        "scene": "02b12e930-off-0"
      },
      "method": "PUT"
    },
    "time": "PT00:01:00",
    "created": "2014-06-23T13:39:16",
    "status": "disabled",
    "autodelete": false,
    "starttime": "2014-06-23T13:39:16"
  },
  "2": {
    "name": "Alarm",
    "description": "",
    "command": {
      "address": "/api/s95jtYH8HUVWNkCO/groups/0/action",
      "body": {
        "scene": "02b12e930-off-0"
      },
      "method": "PUT"
    },
    "localtime": "2014-06-23T19:52:00",
    "time": "2014-06-23T13:52:00",
    "created": "2014-06-23T13:38:57",
    "status": "disabled",
    "autodelete": false
  }
}
```

## 3.2. Create schedule

| Field      | Value                     |
| ---------- | ------------------------- |
| URL        | /api/<username>/schedules |
| Method     | POST                      |
| Version    | 1.0                       |
| Permission | Whitelist                 |

### 3.2.1. Description

Allows the user to create new schedules. The bridge can store up to 100 schedules.

Starting 1.17, creations of schedules with PUT is deprecated.  PUT on existing schedules is still allowed.

### 3.2.2. Body arguments

| Column 1    | Column 2     | Column 3                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Column 4 |
| ----------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Name        | Type         | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |          |
| name        | string 0..32 | Name for the new schedule. If a name is not specified then the default name, “schedule”, is used.If the name is already taken a space and number will be appended by the bridge, e.g. “schedule 1”.                                                                                                                                                                                                                                                                                                                                                                                    | Optional |
| description | string 0..64 | Description of the new schedule. If the description is not specified it will be empty.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Optional |
| command     | object       | Command to execute when the scheduled event occurs. If the command is not valid then an error of type 7 will be raised.Tip: See below command object attributes for more information.                                                                                                                                                                                                                                                                                                                                                                                                  | Required |
| time        | string       | Time when the scheduled event will occur. Time is measured in the bridge in UTC time. Either time or localtime has to be provided.DEPRECATED This attribute will be removed in the future. Please use localtime instead.The following time patterns are allowed:Absolute timeRandomized timeRecurring timesRecurring randomized timesTimersFor a full description of the allowed time pattern formats please check the allowed time patternsIncorrectly formatted dates will raise an error of type 7. If the time is in the past an error 7 will also be raised.                      | Required |
| staus       | string 5..16 | “enabled” Schedule is enabled“disabled” Schedule is disabled by user.Application is only allowed to set “enabled” or “disabled”. Disabled causes a timer to reset when activated (i.e. stop & reset). “enabled” when not provided on creation.                                                                                                                                                                                                                                                                                                                                         | Optional |
| autodelete  | bool         | If set to true, the schedule will be removed automatically if expired, if set to false it will be disabled. Default is true. Only visible for non-recurring schedules.                                                                                                                                                                                                                                                                                                                                                                                                                 | Optional |
| localtime   | string       | Local time when the scheduled event will occur.Either time or localtime has to be provided. A schedule configured with localtime will operate on localtime and is returned along with the time attribute (UTC) for backwards compatibility. The following time patterns are allowed:Absolute timeRandomized timeRecurring timesRecurring randomized timesTimersFor a full description of the allowed time pattern formats please check the allowed time patterns.Incorrectly formatted dates will raise an error of type 7. If the time is in the past an error 7 will also be raised. | Required |
| recycle     | bool         | When true: Resource is automatically deleted when not referenced anymore in any resource link. Only on creation of resource. “false” when omitted.                                                                                                                                                                                                                                                                                                                                                                                                                                     | Optional |

Command object attributes:

| Column 1 | Column 2     | Column 3                                                                                                         | Column 4 |
| -------- | ------------ | ---------------------------------------------------------------------------------------------------------------- | -------- |
| Name     | Type         | Description                                                                                                      |          |
| address  | string 1..64 | Path to a light resource, a group resource or any other bridge resource (including “/api/<username>/”)           | Required |
| method   | string 3..6  | The HTTPS method used to send the body to the given address. Either “POST”, “PUT”, “DELETE” for local addresses. | Required |
| body     | string 1..90 | JSON string to be sent to the relevant resource.                                                                 | Required |

### 3.2.3. Sample Body

```json
{
  "name": "Wake up",
  "description": "My wake up alarm",
  "command": {
    "address": "/api/<username>/groups/1/action",
    "method": "PUT",
    "body": {
      "on": true
    }
  },
  "localtime": "2015-06-30T14:24:40"
}
```

### 3.2.4. Response

Contains a list with a single item that details whether the schedule was added successfully.

### 3.2.5. Response example

```json
[
  {
    "success": { "id": "2" }
  }
]
```

### 3.2.6. Notes

The following errors can occur upon schedule creation:

| Field | Value                                   |
| ----- | --------------------------------------- |
| code  | description                             |
| 701   | Schedule list is full                   |
| 702   | Schedule time-zone not valid.           |
| 703   | Schedule cannot set time and local time |

## 3.3. Get schedule attributes

| Field      | Value                          |
| ---------- | ------------------------------ |
| URL        | /api/<username>/schedules/<id> |
| Method     | GET                            |
| Version    | 1.0                            |
| Permission | Whitelist                      |

### 3.3.1. Description

Gets all attributes for a schedule.

### 3.3.2. Response

| Column 1    | Column 2     | Column 3                                                                                                                                                                                                                                                                                                                              |
| ----------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nam         | Type         | Description                                                                                                                                                                                                                                                                                                                           |
| name        | string 0..32 | The name of the schedule.                                                                                                                                                                                                                                                                                                             |
| description | string 0..64 | Description of the schedule.                                                                                                                                                                                                                                                                                                          |
| command     | object 0..90 | Command to execute when the scheduled event occurs.                                                                                                                                                                                                                                                                                   |
| time        | string       | Time when the scheduled event will occur. DEPRECATED Will be removed in the future. Please use localtime instead.The following time patterns are allowed:Absolute timeRandomized timeRecurring timesRecurring randomized timesTimersFor a full description of the allowed time pattern formats please check the allowed time patterns |
| localtime   | string       | Time when the scheduled event will occur.The following time patterns are allowed:Absolute timeRandomized timeRecurring timesRecurring randomized timesTimersFor a full description of the allowed time pattern formats please check the allowed time patterns                                                                         |
| starttime   | string       | UTC time that the timer was started. Only provided for timers.                                                                                                                                                                                                                                                                        |
| status      | string 5..16 | “enabled” Schedule is enabled“disabled” Schedule is disabled by user.Application is only allowed to set “enabled” or “disabled”. Disabled causes a timer to reset when activated (i.e. stop & reset). “enabled” when not provided on creation.                                                                                        |
| autodelete  | bool         | If set to true, the schedule will be removed automatically if expired, if set to false it will be disabled. Default is true                                                                                                                                                                                                           |

### 3.3.3. Sample Response

```json
{
  "name": "Wake up",
  "description": "My wake up alarm",
  "command": {
    "address": "/api/<username>/groups/1/action",
    "method": "PUT",
    "body": {
      "on": true
    }
  },
  "time": "W124/T06:00:00"
}
```

Note: W124/T06:00:00 means every weekday at 06:00.

## 3.4. Set schedule attributes

| Field      | Value                          |
| ---------- | ------------------------------ |
| URL        | /api/<username>/schedules/<id> |
| Method     | PUT                            |
| Version    | 1.0                            |
| Permission | Whitelist                      |

### 3.4.1. Description

Allows the user to change attributes of a schedule.

### 3.4.2. Body arguments

| Column 1    | Column 2     | Column 3                                                                                                                                                                                                                                                                                                                                                                            | Column 4 |
| ----------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Name        | Type         | Description                                                                                                                                                                                                                                                                                                                                                                         |          |
| name        | string 0..32 | Name for the schedule.If the name is already taken a space and number will be appended by the bridge, e.g. “schedule 1”.                                                                                                                                                                                                                                                            | Optional |
| description | object 0..64 | Description of the schedule.                                                                                                                                                                                                                                                                                                                                                        | Optional |
| command     | object 0..90 | Command to execute when the scheduled event occurs. If the command is not valid then an error of type 7 will be raised.Tip: Stripping unnecessary whitespace can help to keep commands within the 90 character limit.                                                                                                                                                               | Optional |
| time        | string       | Deprecated Please use localtime instead. The following time patterns are allowed:Absolute timeRandomized timeRecurring timesRecurring randomized timesTimersFor a full description of the allowed time pattern formats please check the allowed time patterns.Incorrectly formatted dates will raise an error of type 7. If the time is in the past an error 7 will also be raised. | Optional |
| localtime   | string       | The following time patterns are allowed:Absolute timeRandomized timeRecurring timesRecurring randomized timesTimersFor a full description of the allowed time pattern formats please check the allowed time patterns.Incorrectly formatted dates will raise an error of type 7. If the time is in the past an error 7 will also be raised.                                          | Optional |
| status      | string 5..16 | “disabled” causes a timer to reset when activated (i.e. stop & reset).                                                                                                                                                                                                                                                                                                              | Optional |
| autodelete  | bool         | If set to true, the schedule will be removed automatically if expired, if set to false it will be disabled. Default is true                                                                                                                                                                                                                                                         | Optional |

### 3.4.3. Sample Body

```json
{
  "name": "Wake up"
}
```

### 3.4.4. Response

A response to a successful `PUT` request contains confirmation of the arguments passed in. Note: If the new value is too large to return in the response due to internal memory constraints then a value of “Updated.” is returned.

### 3.4.5. Sample Response

```json
[{ "success": { "/schedules/1/name": "Wake up" } }]
```

## 3.5. Delete schedule

| Field      | Value                          |
| ---------- | ------------------------------ |
| URL        | /api/<username>/schedules/<id> |
| Method     | DELETE                         |
| Version    | 1.0                            |
| Permission | Whitelist                      |

### 3.5.1. Description

Deletes a schedule from the bridge.

### 3.5.2. Response

The response details whether the schedule was successfully deleted.

### 3.5.3. Sample Response

```json
[{ "success": "/schedules/1 deleted." }]
```
