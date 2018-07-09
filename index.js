const config = {
  influx: {
    host: process.env.INFLUX_HOST || 'localhost',
    port: process.env.INFLUX_PORT || 8086,
    database: process.env.INFLUX_DB || 'marathon'
  },
  marathon: {
    host: process.env.MARATHON_HOST || 'localhost',
    port: process.env.MARATHON_PORT || 8080
  }
}

const Influx = require('influx');
const influx = new Influx.InfluxDB(config.influx);

// Use the MarathonEventBusClient
const MarathonEventBusClient = require("marathon-event-bus-client");

// Define relevant event types
const eventTypes = [
  "pod_created_event",
  "pod_updated_event",
  "pod_deleted_event",
  "scheduler_registered_event",
  "scheduler_reregistered_event",
  "scheduler_disconnected_event",
  "subscribe_event",
  "unsubscribe_event",
  "event_stream_attached",
  "event_stream_detached",
  "add_health_check_event",
  "remove_health_check_event",
  "failed_health_check_event",
  "health_status_changed_event",
  "unhealthy_task_kill_event",
  "unhealthy_instance_kill_event",
  "group_change_success",
  "group_change_failed",
  "deployment_success",
  "deployment_failed",
  "deployment_info",
  "deployment_step_success",
  "deployment_step_failure",
  "app_terminated_event",
  "status_update_event",
  "instance_changed_event",
  "unknown_instance_terminated_event",
  "instance_health_changed_event",
  "framework_message_event"
];

const generalEventHandler = function (eventType, data) {
  let tags = { eventType: data.eventType };

  let points = [
    {
      measurement: `event_bus_${data.eventType}`,
      tags: tags,
      fields: { value: 1 },
      timestamp: `${new Date(data.timestamp).getTime()}000000`
    }
  ]

  if (eventType == "event_stream_attached" || eventType == "event_stream_detached") {
    tags.remoteAddress = data.remoteAddress;
  } else if (eventType == "app_terminated_event") {
    tags.appId = data.appId;
  } else if (eventType == "status_update_event") {
    tags.slaveId = data.slaveId;
    tags.taskId = data.taskId;
    tags.taskStatus = data.taskStatus;
    tags.appId = data.appId;
    tags.host = data.host;
    tags.ports = JSON.stringify(data.ports);
    tags.version = data.version;
  } else if (eventType == "instance_changed_event") {
    tags.instanceId = data.instanceId;
    tags.condition = data.condition;
    tags.runSpecId = data.runSpecId;
    tags.agentId = data.agentId;
    tags.host = data.host;
    tags.runSpecVersion = data.runSpecVersion;
  } else if (eventType == "unknown_instance_terminated_event") {
    tags.instanceId = data.instanceId;
    tags.condition = data.condition;
    tags.runSpecId = data.runSpecId;
  } else if (eventType == "instance_health_changed_event") {
    tags.runSpecId = data.runSpecId;
    tags.healthy = data.healthy;
    tags.runSpecVersion = data.runSpecVersion;
  } else if (eventType == "framework_message_event") {
    tags.slaveId = data.slaveId;
    tags.executorId = data.executorId;
    tags.message = data.message;
  } else if (eventType == "add_health_check_event" || eventType == "remove_health_check_event") {
    tags.appId = data.appId;
  } else if (eventType == "failed_health_check_event") {
    tags.appId = data.appId;
    tags.taskId = data.taskId;
  } else if (eventType == "health_status_changed_event") {
    tags.appId = data.appId;
    tags.instanceId = data.instanceId;
    tags.alive = data.alive;
    tags.version = data.version;
  } else if (eventType == "unhealthy_task_kill_event") {
    tags.appId = data.appId;
    tags.taskId = data.taskId;
    tags.reason = data.reason;
    tags.host = data.host;
    tags.slaveId = data.slaveId;
    tags.version = data.version;
  } else if (eventType == "unhealthy_instance_kill_event") {
    tags.appId = data.appId;
    tags.taskId = data.taskId;
    tags.instanceId = data.instanceId;
    tags.reason = data.reason;
    tags.host = data.host;
    tags.slaveId = data.slaveId;
    tags.version = data.version;
  } else if (eventType == "group_change_success") {
    tags.groupId = data.groupId;
    tags.version = data.version;
  } else if (eventType == "group_change_failed") {
    tags.groupId = data.groupId;
    tags.version = data.version;
  } else if (eventType == "deployment_success") {
    tags.id = data.id;
  } else if (eventType == "deployment_failed") {
    tags.id = data.id;
  } else if (eventType == "deployment_info" || eventType == "deployment_step_success" || eventType == "deployment_step_failure") {
    points = data.currentStep.actions.map(function (action) {
      return {
        measurement: `event_bus_${data.eventType}`,
        tags: {
          plan_id: data.plan.id,
          plan_steps: JSON.stringify(data.plan.steps),
          plan_currentStep: JSON.stringify(data.currentStep),
          action: action.action,
          app: action.app
        },
        fields: { value: 1 },
        timestamp: `${new Date(data.timestamp).getTime()}000000`
      }
    });
  } else {
    console.log(`don't know how to handle event: ${eventType}: ${JSON.stringify(data)}`)
  }

  influx.writePoints(points).catch(function (x) {
    console.log(`Write to influxdb failed, error: ${x}`)
  });
}

const eventHandlers = eventTypes.reduce(function (map, eventType) {
  map[eventType] = generalEventHandler;
  return map;
}, {});

// Create MarathonEventBusClient instance
const mebc = new MarathonEventBusClient({
  marathonHost: config.marathon.host,
  marathonPort: config.marathon.port,
  eventTypes: eventTypes,
  handlers: eventHandlers
});

// Wait for "connected" event
mebc.on("subscribed", function () {
  console.log("Subscribed to the Marathon Event Bus");
});

// Wait for "unsubscribed" event
mebc.on("unsubscribed", function () {
  console.log("Unsubscribed from the Marathon Event Bus");
});

// Catch error events
mebc.on("error", function (errorObj) {
  console.log("Got an error on " + errorObj.timestamp + ":");
  console.log(JSON.stringify(errorObj.error));
});

// Subscribe to Marathon Event Bus
mebc.subscribe();
