---
title: "Hue API v1 Error Messages"
keywords:
  [
    "Hue API v1",
    "errors",
    "error codes",
    "generic errors",
    "command errors",
    "troubleshooting",
  ]
summary: "Reference for Hue API v1 generic and command-specific error messages, including error numbers, descriptions, and likely causes."
---

# Error messages

If an API call fails to execute an error message is returned. This will take the following form:

```json
{
        "error": {
            "type": <ID> ,
            "address": </resource/parameteraddress>,
            "description": <description>
        }
    }
```

One error message per failed action will be returned using a priority system. The priority system uses the error number, with a lower number meaning a higher priority. In the case of a `PUT` command, an error may be given for each parameter on which a change was attempted.

The following tables list all error codes that are used by the bridge.

Key:

| <resource>    | Resource being acted on e.g. /lights/1                  |
| ------------- | ------------------------------------------------------- |
| <method_name> | HTTPS Method e.g. PUT/POST/DELETE/GET                   |
| <parameter>   | URI of the parameter being modified e.g. /lights/1/name |
| <value>       | Value the parameter is being set to e.g. 128            |

### Generic Errors

| ID  | Description                                                   | Details                                                                                                                                                                                       |
| --- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | unauthorized user                                             | This will be returned if an invalid username is used in the request, or if the username does not have the rights to modify the resource.                                                      |
| 2   | body contains invalid JSON                                    | This will be returned if the body of the message contains invalid JSON.                                                                                                                       |
| 3   | resource, <resource>, not available                           | This will be returned if the addressed resource does not exist. E.g. the user specifies a light ID that does not exist.                                                                       |
| 4   | method, <method_name>, not available for resource, <resource> | This will be returned if the method (GET/POST/PUT/DELETE) used is not supported by the URL e.g. DELETE is not supported on the /config resource                                               |
| 5   | missing parameters in body                                    | Will be returned if required parameters are not present in the message body. The presence of invalid parameters should not trigger this error as long as all required parameters are present. |
| 6   | parameter, <parameter>, not available                         | This will be returned if a parameter sent in the message body does not exist. This error is specific to PUT commands; invalid parameters in other commands are simply ignored.                |
| 7   | invalid value, <value>, for parameter, <parameter>            | This will be returned if the value set for a parameter is of the incorrect format or is out of range.                                                                                         |
| 8   | parameter, <parameter>, is not modifiable                     | This will be returned if an attempt to modify a read only parameter is made.                                                                                                                  |
| 11  | too many items in list                                        | List in request contains too many items                                                                                                                                                       |
| 12  | Portal connection required                                    | Command requires portal connection. Returned if portalservices is “false“ or the portal connection is down                                                                                    |
| 901 | Internal error, <error code>                                  | This will be returned if there is an internal error in the processing of the command. This indicates an error in the bridge, not in the message being sent.                                   |

## Command Specific Error numbers and descriptions

| Column 1 | Column 2                                                         | Column 3                                                                                                                                                                                                                                                 |
| -------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ID       | Description                                                      | Usage                                                                                                                                                                                                                                                    |
| 101      | link button not pressed                                          | /config/linkbutton is false. Link button has not been pressed in last 30 seconds.                                                                                                                                                                        |
| 110      | DHCP cannot be disabled                                          | DHCP can only be disabled if there is a valid static IP configuration                                                                                                                                                                                    |
| 111      | Invalid updatestate                                              | checkforupdate can only be set in updatestate 0 and 1.                                                                                                                                                                                                   |
| 201      | parameter, <parameter>, is not modifiable. Device is set to off. | This will be returned if a user attempts to modify a parameter which cannot be modified due to current state of the device. This will most commonly be returned if the hue/sat/bri/effect/xy/ct parameters are modified while the on parameter is false. |
| 203      | Commissionable light list full                                   | No more space left to commission a new ZigBee light.                                                                                                                                                                                                     |
| 301      | group could not be created. Group table is full.                 | The bridge can store a maximum of 64 groups. This error will be returned if there are already the maximum number of groups created in the bridge.                                                                                                        |
| 305      | It is not allowed to update or delete group of this type         | This will be returned if an attempt to update a light list in a group or delete a group of type “Luminaire” or “LightSource”                                                                                                                             |
| 306      | Light is already used in another room                            | A light can only be used in 1 room at the same time.Note: Added in1.11                                                                                                                                                                                   |
| 402      | Scene could not be created. Scene buffer in bridge full          | It is not possibly anymore to buffer scenes in the bridge for the lights. Application can try again later, let the user turn on lights, remove schedules or delete scenes                                                                                |
| 403      | Scene couldn’t not be removed, because it’s locked.              | Scene could not be removed, because it’s locked. Delete the resource (schedule or rule action) that is locking it first.                                                                                                                                 |
| 404      | Scene could not be created, group is empty                       | It is not allowed to create a GroupScene associated to an empty group                                                                                                                                                                                    |
| 501      | No allowed to create sensor type                                 | Will be returned if the sensor type cannot be created using CLIP                                                                                                                                                                                         |
| 502      | Sensor list is full                                              | This will be returned if there are already the maximum number of sensors created in the bridge.                                                                                                                                                          |
| 503      | Commissionable sensor list full                                  | No more space left to commission a new ZigBee sensor.See also /capabilities/sensors.                                                                                                                                                                     |
| 601      | Rule engine full                                                 | Returned when already 100 rules are created and no further rules can be added                                                                                                                                                                            |
| 607      | Condition error                                                  | Rule conditions contain errors or operator combination is not allowed (e.g. only one dt operator is allowed)                                                                                                                                             |
| 608      | Action error                                                     | Rule actions contain errors or multiple actions with the same resource address                                                                                                                                                                           |
| 609      | Unable to activate                                               | Unable to set rule status to ‘enable, because rule conditions references unknown resource or unsupported resource attribute                                                                                                                              |
| 701      | Schedule list is full                                            | This will be returned if there are already the maximum number of schedules created in the bridge.                                                                                                                                                        |
| 702      | Schedule time-zone not valid                                     | Cannot set parameter ‘localtime’, because timezone has not been configured.                                                                                                                                                                              |
| 703      | Schedule cannot set time and local time                          | Cannot set parameter ‘time’ and ‘localtime’ at the same time.                                                                                                                                                                                            |
| 704      | Cannot create schedule                                           | Cannot create schedule because tag, <tag>, is invalid.                                                                                                                                                                                                   |
| 705      | Cannot enable schedule, time is in the past                      | The schedule has expired , the time pattern has to be updated before enabling                                                                                                                                                                            |
| 706      | Command error                                                    | Schedule command on a unsupported resource.                                                                                                                                                                                                              |
| 801      | Source model invalid                                             | Backup is requested on an unsupported bridge model.                                                                                                                                                                                                      |
| 802      | Source factory new                                               | Backup is requested on a factory new bridge, nothing to backup.                                                                                                                                                                                          |
| 803      | Invalid state                                                    | Backup is requested in another state then idle.                                                                                                                                                                                                          |
