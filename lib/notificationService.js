// @ts-nocheck
"use client";

import { toast } from "sonner";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { firestore, auth } from "@/lib/firebase";
import * as Icons from "lucide-react";
import { isGloballyMuted } from "@/lib/useGlobalMute";

/**
 * Notification types - consistent identifiers for all notification types
 */
export const NOTIFICATION_TYPES = {
  WATER_LOW: "water_low",
  WATER_OK: "water_ok",
  HEATER_ON: "heater_on",
  HEATER_OFF: "heater_off",
  EGG_TURNER_ON: "egg_turner_on",
  EGG_TURNER_OFF: "egg_turner_off",
  FAN_ON: "fan_on",
  FAN_OFF: "fan_off",
  HUMIDIFIER_ON: "humidifier_on",
  HUMIDIFIER_OFF: "humidifier_off",
  TEMP_ABNORMAL: "temp_abnormal",
  TEMP_NORMAL: "temp_normal",
  HUMIDITY_ABNORMAL: "humidity_abnormal",
  HUMIDITY_NORMAL: "humidity_normal",
  DEVICE_OFFLINE: "device_offline",
  DEVICE_ONLINE: "device_online",
  EMAIL_LIMIT: "email_limit",
  EMAIL_AUTH_THROTTLE: "email_auth_throttle",
};

/**
 * Notification messages - uniform formatting for all events
 */
const getNotificationMessage = (type, deviceName, value) => {
  const messages = {
    [NOTIFICATION_TYPES.WATER_LOW]: {
      title: `Water Low - ${deviceName}`,
      description: "Water level is low. Please refill.",
      variant: "warning",
      icon: "Droplet",
      iconColor: "text-amber-500",
      action: "warning",
    },
    [NOTIFICATION_TYPES.WATER_OK]: {
      title: `Water OK - ${deviceName}`,
      description: "Water level is normal.",
      variant: "success",
      icon: "Droplet",
      iconColor: "text-emerald-500",
      action: "info",
    },
    [NOTIFICATION_TYPES.HEATER_ON]: {
      title: `Heater ON - ${deviceName}`,
      description: "Heater has started.",
      variant: "info",
      icon: "Heater",
      iconColor: "text-emerald-500",
      action: "on",
    },
    [NOTIFICATION_TYPES.HEATER_OFF]: {
      title: `Heater OFF - ${deviceName}`,
      description: "Heater has stopped.",
      variant: "info",
      icon: "Heater",
      iconColor: "text-rose-500",
      action: "off",
    },
    [NOTIFICATION_TYPES.EGG_TURNER_ON]: {
      title: `Egg Turner ON - ${deviceName}`,
      description: "Egg turner has started rotation.",
      variant: "info",
      icon: "RotateCcw",
      iconColor: "text-emerald-500",
      action: "on",
    },
    [NOTIFICATION_TYPES.EGG_TURNER_OFF]: {
      title: `Egg Turner OFF - ${deviceName}`,
      description: "Egg turner has stopped.",
      variant: "info",
      icon: "RotateCcw",
      iconColor: "text-rose-500",
      action: "off",
    },
    [NOTIFICATION_TYPES.FAN_ON]: {
      title: `Fan ON - ${deviceName}`,
      description: "Fan has started.",
      variant: "info",
      icon: "Wind",
      iconColor: "text-emerald-500",
      action: "on",
    },
    [NOTIFICATION_TYPES.FAN_OFF]: {
      title: `Fan OFF - ${deviceName}`,
      description: "Fan has stopped.",
      variant: "info",
      icon: "Wind",
      iconColor: "text-rose-500",
      action: "off",
    },
    [NOTIFICATION_TYPES.HUMIDIFIER_ON]: {
      title: `Humidifier ON - ${deviceName}`,
      description: "Humidifier has started.",
      variant: "info",
      icon: "CloudRain",
      iconColor: "text-emerald-500",
      action: "on",
    },
    [NOTIFICATION_TYPES.HUMIDIFIER_OFF]: {
      title: `Humidifier OFF - ${deviceName}`,
      description: "Humidifier has stopped.",
      variant: "info",
      icon: "CloudRain",
      iconColor: "text-rose-500",
      action: "off",
    },
    [NOTIFICATION_TYPES.TEMP_ABNORMAL]: {
      title: `Abnormal Temperature - ${deviceName}`,
      description: `Temperature is ${value}°C. Check incubator.`,
      variant: "warning",
      icon: "Thermometer",
      iconColor: "text-amber-500",
      action: "warning",
    },
    [NOTIFICATION_TYPES.TEMP_NORMAL]: {
      title: `Temperature Normal - ${deviceName}`,
      description: `Temperature is back to normal (${value}°C).`,
      variant: "success",
      icon: "Thermometer",
      iconColor: "text-emerald-500",
      action: "info",
    },
    [NOTIFICATION_TYPES.HUMIDITY_ABNORMAL]: {
      title: `Abnormal Humidity - ${deviceName}`,
      description: `Humidity is ${value}%. Check incubator.`,
      variant: "warning",
      icon: "Droplets",
      iconColor: "text-amber-500",
      action: "warning",
    },
    [NOTIFICATION_TYPES.HUMIDITY_NORMAL]: {
      title: `Humidity Normal - ${deviceName}`,
      description: `Humidity is back to normal (${value}%).`,
      variant: "success",
      icon: "Droplets",
      iconColor: "text-emerald-500",
      action: "info",
    },
    [NOTIFICATION_TYPES.DEVICE_OFFLINE]: {
      title: `Device Offline – ${deviceName}`,
      description: "Device is not responding. All controls are disabled.",
      variant: "warning",
      icon: "WifiOff",
      iconColor: "text-rose-500",
      action: "warning",
    },
    [NOTIFICATION_TYPES.DEVICE_ONLINE]: {
      title: `Device Online – ${deviceName}`,
      description: "Device is connected and responding.",
      variant: "success",
      icon: "Wifi",
      iconColor: "text-emerald-500",
      action: "info",
    },
    [NOTIFICATION_TYPES.EMAIL_LIMIT]: {
      title: "Email Alert Limit Reached",
      description: "Gmail daily sending limit exceeded. Alert emails are paused until tomorrow.",
      variant: "warning",
      icon: "MailWarning",
      iconColor: "text-amber-500",
      action: "warning",
    },
    [NOTIFICATION_TYPES.EMAIL_AUTH_THROTTLE]: {
      title: "Email Service Temporarily Blocked",
      description: "Gmail blocked login due to too many attempts. Alert emails will resume automatically in a few minutes.",
      variant: "warning",
      icon: "ShieldAlert",
      iconColor: "text-orange-500",
      action: "warning",
    },
  };

  return messages[type] || { title: "Notification", description: "", variant: "info", icon: "Bell", iconColor: "text-sky-500", action: "info" };
};

/**
 * Send toast notification (in-app only) with custom styling
 */
export const sendToastNotification = (type, deviceName, value = null) => {
  // Respect global mute — block all toasts when user has muted globally
  if (isGloballyMuted()) {
    console.log(`[sendToastNotification] Globally muted — toast suppressed for ${type}`);
    return;
  }

  const message = getNotificationMessage(type, deviceName, value);

  const IconComponent = Icons[message.icon];

  try {
    toast.custom((t) => (
      <div className="flex items-center gap-3 rounded-lg bg-white px-4 py-3 shadow-lg ring-1 ring-slate-200 w-80">
        <div className={`shrink-0 ${message.iconColor}`}>
          {IconComponent ? (
            <IconComponent className="h-6 w-6" />
          ) : (
            <Icons.Bell className="h-6 w-6" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate">{message.title}</p>
          {message.description && (
            <p className="mt-0.5 text-xs text-slate-600 line-clamp-2">{message.description}</p>
          )}
        </div>
      </div>
    ), {
      duration: message.variant === "warning" ? 5000 : message.variant === "success" ? 4000 : 3000,
      position: "top-right",
    });
  } catch (error) {
    console.error(`[sendToastNotification] Error:`, error);
  }
};

/**
 * Send push notification (to user's devices via service worker)
 */
export const sendPushNotification = async (type, deviceName, value = null) => {
  console.log(`[sendPushNotification] Starting for ${type} on ${deviceName}`);
  
  if (!("Notification" in window)) {
    console.log("[sendPushNotification] Notifications not supported in this browser");
    return;
  }

  console.log(`[sendPushNotification] Current permission: ${Notification.permission}`);

  if (Notification.permission !== "granted") {
    console.log("[sendPushNotification] Permission not granted, attempting to request...");
    // Try to request permission
    try {
      const permission = await Notification.requestPermission();
      console.log(`[sendPushNotification] Permission result: ${permission}`);
      if (permission !== "granted") {
        return;
      }
    } catch (err) {
      console.error("[sendPushNotification] Error requesting permission:", err);
      return;
    }
  }

  const message = getNotificationMessage(type, deviceName, value);

  try {
    console.log(`[sendPushNotification] Showing notification: ${message.title}`);
    
    // Use standard Notification API directly (simpler and more reliable)
    new Notification(message.title, {
      body: message.description,
      icon: "/eggcubator3.png",
      badge: "/eggcubator3.png",
      tag: type, // Prevents duplicates of same type
      requireInteraction: message.variant === "warning",
    });
    
    console.log(`[sendPushNotification] Notification displayed successfully`);
  } catch (error) {
    console.error("[sendPushNotification] Failed to send:", error);
  }
};

/**
 * Request notification permission from user
 */
export const requestNotificationPermission = async () => {
  if (!("Notification" in window)) {
    return false;
  }

  if (Notification.permission === "granted") {
    return true;
  }

  if (Notification.permission !== "denied") {
    const permission = await Notification.requestPermission();
    return permission === "granted";
  }

  return false;
};

/**
 * Save notification to Firestore for display in notification list
 */
export const saveNotificationToFirestore = async (type, deviceName, value = null) => {
  try {
    const user = auth.currentUser;
    if (!user) {
      console.log(`[saveNotificationToFirestore] No user logged in, skipping save`);
      return;
    }

    const message = getNotificationMessage(type, deviceName, value);
    
    const notificationDoc = {
      type,
      title: message.title,
      text: message.title,
      message: message.description,
      description: message.description,
      deviceName,
      icon: message.icon,
      iconColor: message.iconColor,
      tone: message.variant,
      read: false,
      createdAt: serverTimestamp(),
    };

    const docRef = await addDoc(
      collection(firestore, "users", user.uid, "notifications"),
      notificationDoc
    );

    console.log(`[saveNotificationToFirestore] Saved notification: ${docRef.id}`);
  } catch (error) {
    console.error(`[saveNotificationToFirestore] Error:`, error);
  }
};

/**
 * Send notification based on preferences
 * Respects user's mute/unmute settings
 */
export const sendNotification = async (type, deviceName, value = null, preferences = {}) => {
  // Check if this notification type is explicitly muted (false value)
  const isMuted = preferences[type] === false;
  const isEnabled = preferences[type] === true;
  
  console.log(`[Notifications] Processing ${type} for ${deviceName} - muted: ${isMuted}, enabled: ${isEnabled}, preferences[${type}]: ${preferences[type]}`);
  
  if (isMuted) {
    console.log(`[Notifications] ⏸️ ${type} is MUTED for ${deviceName} - notification blocked`);
    return;
  }

  // Only send if explicitly enabled or if there are preferences loaded
  if (isEnabled || Object.keys(preferences).length > 0) {
    console.log(`[Notifications] 📤 Sending ${type} for ${deviceName}`, { value, isMuted, isEnabled });
    sendToastNotification(type, deviceName, value);
    await sendPushNotification(type, deviceName, value);
    await saveNotificationToFirestore(type, deviceName, value);
  } else {
    console.log(`[Notifications] ⚠️ No preference data for ${type} - notification not sent`);
  }
};
