// @ts-nocheck
"use client";

import { toast } from "sonner";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { firestore, auth } from "@/lib/firebase";
import * as Icons from "lucide-react";

/**
 * Notification types - consistent identifiers for all notification types
 */
export const NOTIFICATION_TYPES = {
  WATER_LOW: "water_low",
  WATER_OK: "water_ok",
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
    },
    [NOTIFICATION_TYPES.WATER_OK]: {
      title: `Water OK - ${deviceName}`,
      description: "Water level is normal.",
      variant: "success",
      icon: "Droplet",
    },
    [NOTIFICATION_TYPES.EGG_TURNER_ON]: {
      title: `Egg Turner ON - ${deviceName}`,
      description: "Egg turner has started rotation.",
      variant: "info",
      icon: "RotateCcw",
    },
    [NOTIFICATION_TYPES.EGG_TURNER_OFF]: {
      title: `Egg Turner OFF - ${deviceName}`,
      description: "Egg turner has stopped.",
      variant: "info",
      icon: "RotateCcw",
    },
    [NOTIFICATION_TYPES.FAN_ON]: {
      title: `Fan ON - ${deviceName}`,
      description: "Fan has started.",
      variant: "info",
      icon: "Wind",
    },
    [NOTIFICATION_TYPES.FAN_OFF]: {
      title: `Fan OFF - ${deviceName}`,
      description: "Fan has stopped.",
      variant: "info",
      icon: "Wind",
    },
    [NOTIFICATION_TYPES.HUMIDIFIER_ON]: {
      title: `Humidifier ON - ${deviceName}`,
      description: "Humidifier has started.",
      variant: "info",
      icon: "CloudRain",
    },
    [NOTIFICATION_TYPES.HUMIDIFIER_OFF]: {
      title: `Humidifier OFF - ${deviceName}`,
      description: "Humidifier has stopped.",
      variant: "info",
      icon: "CloudRain",
    },
    [NOTIFICATION_TYPES.TEMP_ABNORMAL]: {
      title: `Abnormal Temperature - ${deviceName}`,
      description: `Temperature is ${value}°C. Check incubator.`,
      variant: "warning",
      icon: "Thermometer",
    },
    [NOTIFICATION_TYPES.TEMP_NORMAL]: {
      title: `Temperature Normal - ${deviceName}`,
      description: `Temperature is back to normal (${value}°C).`,
      variant: "success",
      icon: "Thermometer",
    },
    [NOTIFICATION_TYPES.HUMIDITY_ABNORMAL]: {
      title: `Abnormal Humidity - ${deviceName}`,
      description: `Humidity is ${value}%. Check incubator.`,
      variant: "warning",
      icon: "Droplets",
    },
    [NOTIFICATION_TYPES.HUMIDITY_NORMAL]: {
      title: `Humidity Normal - ${deviceName}`,
      description: `Humidity is back to normal (${value}%).`,
      variant: "success",
      icon: "Droplets",
    },
  };

  return messages[type] || { title: "Notification", description: "", variant: "info", icon: "Bell" };
};

/**
 * Send toast notification (in-app only) with custom styling
 */
export const sendToastNotification = (type, deviceName, value = null) => {
  const message = getNotificationMessage(type, deviceName, value);
  
  const iconColorMap = {
    warning: "text-rose-500",
    success: "text-emerald-500",
    info: "text-sky-500",
  };

  const IconComponent = Icons[message.icon];
  const iconColor = iconColorMap[message.variant] || "text-slate-500";

  try {
    toast.custom((t) => (
      <div className="flex items-start gap-3 rounded-lg bg-white px-4 py-3 shadow-lg ring-1 ring-slate-200">
        <div className={`shrink-0 ${iconColor}`}>
          {IconComponent ? (
            <IconComponent className="h-5 w-5" />
          ) : (
            <Icons.Bell className="h-5 w-5" />
          )}
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-900">{message.title}</p>
          {message.description && (
            <p className="mt-1 text-xs text-slate-600">{message.description}</p>
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
  
  if (isMuted) {
    console.log(`[Notifications] ${type} is muted for ${deviceName}`);
    return;
  }

  // If preference exists and is not explicitly muted, send notification
  if (preferences[type] !== undefined || Object.keys(preferences).length > 0) {
    console.log(`[Notifications] Sending ${type} for ${deviceName}`, { value, preferences });
    sendToastNotification(type, deviceName, value);
    await sendPushNotification(type, deviceName, value);
    await saveNotificationToFirestore(type, deviceName, value);
  } else {
    console.log(`[Notifications] No preference data for ${type}`);
  }
};
