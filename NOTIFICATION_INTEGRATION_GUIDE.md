# Notification Integration Guide

## Overview

The egg incubator app now includes a comprehensive notification system with:
- **Toast notifications** (in-app, 3-5 seconds)
- **Push notifications** (browser notifications, persistent)
- **User preferences** (mute/unmute per event type)
- **Automatic state tracking** (detects device state changes)

## Components & Hooks

### 1. `notificationService.js` (Core Service)
**Location:** `lib/notificationService.js`

Provides unified notification system with 12 event types:
```javascript
import { 
  NOTIFICATION_TYPES, 
  sendNotification 
} from "@/lib/notificationService";

// Available event types:
// - WATER_LOW, WATER_OK
// - EGG_TURNER_ON, EGG_TURNER_OFF
// - FAN_ON, FAN_OFF
// - HUMIDIFIER_ON, HUMIDIFIER_OFF
// - TEMP_ABNORMAL, TEMP_NORMAL
// - HUMIDITY_ABNORMAL, HUMIDITY_NORMAL
```

**Main Function:**
```javascript
sendNotification(type, deviceName, value, preferences);
// type: NOTIFICATION_TYPES enum
// deviceName: string (e.g., "Barn #1")
// value: optional (number or null)
// preferences: object (checked to see if type is muted)
```

### 2. `useDeviceNotifications.js` (State Change Detection)
**Location:** `lib/useDeviceNotifications.js`

Hook that monitors device state changes and automatically sends notifications.

**Usage:**
```javascript
import { useDeviceNotifications } from "@/lib/useDeviceNotifications";

export default function DeviceControl({ deviceId, deviceState }) {
  const [preferences, setPreferences] = useState({...});
  
  // Hook automatically sends notifications on state changes
  useDeviceNotifications(
    "Barn #1",           // deviceName
    deviceState,         // current device state
    preferences,         // user notification preferences
    true                 // enabled flag
  );
  
  return (<>...</>);
}
```

**Monitored State Changes:**
- Water level: `waterLow` true/false
- Egg turner: `eggTurner` true/false
- Fan: `fan` true/false
- Humidifier: `humidifier` true/false
- Temperature abnormal: compares `tempC` against `tempTrigger`/`tempStop`
- Humidity abnormal: compares `humidity` against `humidityTrigger`/`humidityStop`

### 3. `useNotificationPreferences.js` (User Preferences)
**Location:** `lib/useNotificationPreferences.js`

Hook to fetch and manage user notification preferences per device.

**Usage:**
```javascript
import { useNotificationPreferences } from "@/lib/useNotificationPreferences";

const { preferences, loading, error, updatePreference, updateAllPreferences } 
  = useNotificationPreferences(uid, deviceId);

// Toggle a single notification type
await updatePreference(NOTIFICATION_TYPES.WATER_LOW, false); // mute

// Update all preferences
await updateAllPreferences({
  [NOTIFICATION_TYPES.WATER_LOW]: false,
  [NOTIFICATION_TYPES.TEMP_ABNORMAL]: true,
  // ... other types
});
```

**Storage:** Firestore at `users/{uid}/devices/{deviceId}/notificationPreferences/settings`

### 4. `NotificationSettings.js` (UI Component)
**Location:** `components/NotificationSettings.js`

Pre-built UI component displaying mute/unmute toggles for all 12 notification types.

**Usage:**
```javascript
import NotificationSettings from "@/components/NotificationSettings";

export default function ControlPage() {
  const { preferences, loading, updatePreference } = useNotificationPreferences(uid, deviceId);
  
  return (
    <NotificationSettings 
      preferences={preferences}
      onToggle={updatePreference}
      loading={loading}
    />
  );
}
```

**Features:**
- 5 grouped sections (Device Status, Egg Turner, Fan, Humidifier, Environmental Alerts)
- Visual toggle switches with bell icons
- Responsive grid layout
- Disabled state during loading

## Integration Examples

### Example 1: Add Notifications to Device Control Page

**File:** `app/devices/[deviceId]/control/page.js`

```javascript
"use client";

import { useDeviceNotifications } from "@/lib/useDeviceNotifications";
import { useNotificationPreferences } from "@/lib/useNotificationPreferences";
import NotificationSettings from "@/components/NotificationSettings";
import { useAuth } from "@/components/AuthProvider";

export default function ControlPage() {
  const { user } = useAuth();
  const { live } = useIncubatorDevices(deviceId);
  const { preferences, updatePreference } = useNotificationPreferences(user?.uid, deviceId);

  // Automatically send notifications on state changes
  useDeviceNotifications(
    deviceName || deviceId,
    live,
    preferences,
    true // enabled
  );

  return (
    <div className="space-y-8">
      {/* Existing control sections */}
      <ManualControls device={live} />
      <AutoModeSettings device={live} />
      
      {/* New: Notification settings section */}
      <div className="rounded-lg border border-slate-200 p-6">
        <h2 className="text-lg font-semibold mb-4">Notifications</h2>
        <NotificationSettings 
          preferences={preferences}
          onToggle={updatePreference}
          loading={false}
        />
      </div>
    </div>
  );
}
```

### Example 2: Add Notifications to Dashboard

**File:** `app/dashboard/page.js`

```javascript
import { useDeviceNotifications } from "@/lib/useDeviceNotifications";
import { useNotificationPreferences } from "@/lib/useNotificationPreferences";

export default function Dashboard() {
  const { user } = useAuth();
  const devices = useUserDevices(user?.uid);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {devices.map((device) => (
        <DeviceCard 
          key={device.deviceId} 
          device={device}
          userId={user?.uid}
        />
      ))}
    </div>
  );
}

function DeviceCard({ device, userId }) {
  const { live } = useIncubatorDevices(device.deviceId);
  const { preferences } = useNotificationPreferences(userId, device.deviceId);

  // Automatically send notifications on state changes
  useDeviceNotifications(
    device.name || device.deviceId,
    live,
    preferences,
    true
  );

  return (
    <div className="p-4 rounded-lg border border-slate-200">
      {/* Existing card content */}
    </div>
  );
}
```

### Example 3: Manual Notification Trigger

```javascript
import { sendNotification, NOTIFICATION_TYPES } from "@/lib/notificationService";

// Manually trigger a notification (useful for events outside normal state changes)
async function handleCustomEvent(deviceName, userPreferences) {
  await sendNotification(
    NOTIFICATION_TYPES.WATER_LOW,
    deviceName,
    null,
    userPreferences
  );
}
```

## Firestore Structure

### Notification Preferences Storage
```
users/
  {uid}/
    devices/
      {deviceId}/
        notificationPreferences/
          settings:
            waterLow: true/false
            waterOk: true/false
            eggTurnerOn: true/false
            eggTurnerOff: true/false
            fanOn: true/false
            fanOff: true/false
            humidifierOn: true/false
            humidifierOff: true/false
            tempAbnormal: true/false
            tempNormal: true/false
            humidityAbnormal: true/false
            humidityNormal: true/false
            updatedAt: "2024-01-15T10:30:00Z"
```

## Features & Behavior

### Toast Notifications (In-App)
- **Duration:** 3-5 seconds (longer for warnings)
- **Variant:** "warning" (error), "success", "info"
- **Library:** sonner
- **Auto-dismiss:** Yes
- **Multiple:** Stack vertically

### Push Notifications (Browser)
- **Requires:** User permission (requested on first notification)
- **Persists:** Yes (works when app is closed)
- **Tag:** Deduplication by event type + device ID
- **Title:** Device name + action
- **Body:** Formatted message with value/duration

### Preference Checking
- Before sending any notification, service checks `preferences[type]`
- If `preferences[type] === false`, notification is muted (no toast, no push)
- Default: All notifications enabled
- Stored per-device in Firestore

### State Change Detection
The `useDeviceNotifications` hook:
1. Compares previous state to current state
2. Detects state transitions (e.g., false → true, true → false)
3. Checks if threshold boundaries are crossed (for temp/humidity)
4. Sends appropriate notification type
5. Updates reference for next cycle

## Threshold Thresholds

For temperature and humidity abnormality detection:

**Temperature:**
- Abnormal if: `tempC < tempTrigger` OR `tempC > tempStop`
- Default triggers: `tempTrigger: 37.5°C`, `tempStop: 38.0°C`

**Humidity:**
- Abnormal if: `humidity < humidityTrigger` OR `humidity > humidityStop`
- Default triggers: `humidityTrigger: 60%`, `humidityStop: 65%`

## Next Steps for Integration

### Priority 1: Add to Control Pages
1. Import `useDeviceNotifications` and `useNotificationPreferences`
2. Call hooks with device state and preferences
3. Add `NotificationSettings` UI component

### Priority 2: Add to Dashboard
1. Wrap `useDeviceNotifications` in each device card
2. Enable per-device notification tracking

### Priority 3: Enhance Service Worker (Optional)
1. Create `public/service-worker.js`
2. Register in `app/layout.tsx`
3. Handle `SHOW_NOTIFICATION` postMessage
4. Enable notifications when app is closed

### Priority 4: User Onboarding
1. Request notification permission on first login
2. Show notification preferences in settings
3. Explain each notification type in help docs

## Troubleshooting

### Notifications Not Sending
- Check browser notification permission: `Notification.permission`
- Verify preferences are loaded: `useNotificationPreferences` returns non-null
- Check browser console for errors in `notificationService.js`

### Preferences Not Persisting
- Verify Firestore is connected
- Check `useNotificationPreferences` loading state
- Ensure user is authenticated

### Duplicate Notifications
- Check if `useDeviceNotifications` is being called multiple times
- Verify component re-renders aren't excessive
- Check browser's push notification tag deduplication

### Service Worker Issues
- If push notifications don't work offline:
  1. Create `public/service-worker.js`
  2. Register in `app/layout.tsx`
  3. Handle notification click events
  4. Test with "offline" in DevTools

## API Reference

### `sendNotification(type, deviceName, value, preferences)`
- **type** (required): `NOTIFICATION_TYPES` enum value
- **deviceName** (required): string, displayed in notification
- **value** (optional): number or null, appended to message
- **preferences** (optional): object with mute flags
- **Returns:** Promise (void)

### `getNotificationMessage(type, deviceName, value)`
- **Returns:** Object with `title`, `description`, `variant`

### `sendToastNotification(type, deviceName, value)`
- Displays in-app toast via sonner library
- Duration: 3-5s based on variant

### `sendPushNotification(type, deviceName, value)`
- Requests permission if not granted
- Shows browser notification with tag deduplication
- Returns: Promise

### `requestNotificationPermission()`
- Requests browser notification permission
- **Returns:** Promise<boolean> (granted or not)

## Examples of Notification Messages

```
🌊 Barn #1: Water level LOW
✓ Barn #1: Water level Normal
🔄 Barn #1: Egg Turner Started
⏹ Barn #1: Egg Turner Stopped
💨 Barn #1: Fan Started
⏹ Barn #1: Fan Stopped
💧 Barn #1: Humidifier Started
⏹ Barn #1: Humidifier Stopped
🌡 Barn #1: Temperature WARNING (35.2°C)
✓ Barn #1: Temperature Normal (37.8°C)
💧 Barn #1: Humidity WARNING (72%)
✓ Barn #1: Humidity Normal (62%)
```
