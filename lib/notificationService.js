// @ts-nocheck
"use client";

import { toast } from "sonner";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { firestore, auth } from "@/lib/firebase";

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
    },
    [NOTIFICATION_TYPES.WATER_OK]: {
      title: `Water OK - ${deviceName}`,
      description: "Water level is normal.",
      variant: "success",
    },
    [NOTIFICATION_TYPES.EGG_TURNER_ON]: {
      title: `Egg Turner ON - ${deviceName}`,
      description: "Egg turner has started rotation.",
      variant: "info",
    },
    [NOTIFICATION_TYPES.EGG_TURNER_OFF]: {
      title: `Egg Turner OFF - ${deviceName}`,
      description: "Egg turner has stopped.",
      variant: "info",
    },
    [NOTIFICATION_TYPES.FAN_ON]: {
      title: `Fan ON - ${deviceName}`,
      description: "Fan has started.",
      variant: "info",
    },
    [NOTIFICATION_TYPES.FAN_OFF]: {
      title: `Fan OFF - ${deviceName}`,
      description: "Fan has stopped.",
      variant: "info",
    },
    [NOTIFICATION_TYPES.HUMIDIFIER_ON]: {
      title: `Humidifier ON - ${deviceName}`,
      description: "Humidifier has started.",
      variant: "info",
    },
    [NOTIFICATION_TYPES.HUMIDIFIER_OFF]: {
      title: `Humidifier OFF - ${deviceName}`,
      description: "Humidifier has stopped.",
      variant: "info",
    },
    [NOTIFICATION_TYPES.TEMP_ABNORMAL]: {
      title: `Abnormal Temperature - ${deviceName}`,
      description: `Temperature is ${value}°C. Check incubator.`,
      variant: "warning",
    },
    [NOTIFICATION_TYPES.TEMP_NORMAL]: {
      title: `Temperature Normal - ${deviceName}`,
      description: `Temperature is back to normal (${value}°C).`,
      variant: "success",
    },
    [NOTIFICATION_TYPES.HUMIDITY_ABNORMAL]: {
      title: `Abnormal Humidity - ${deviceName}`,
      description: `Humidity is ${value}%. Check incubator.`,
      variant: "warning",
    },
    [NOTIFICATION_TYPES.HUMIDITY_NORMAL]: {
      title: `Humidity Normal - ${deviceName}`,
      description: `Humidity is back to normal (${value}%).`,
      variant: "success",
    },
  };

  return messages[type] || { title: "Notification", description: "", variant: "info" };
};

/**
 * Send toast notification (in-app only)
 */
export const sendToastNotification = (type, deviceName, value = null) => {
  const message = getNotificationMessage(type, deviceName, value);

  try {
    if (message.variant === "warning") {
      console.log(`[sendToastNotification] Showing warning toast: ${message.title}`);
      toast.error(message.title, {
        description: message.description,
        duration: 5000,
      });
    } else if (message.variant === "success") {
      console.log(`[sendToastNotification] Showing success toast: ${message.title}`);
      toast.success(message.title, {
        description: message.description,
        duration: 4000,
      });
    } else {
      console.log(`[sendToastNotification] Showing info toast: ${message.title}`);
      toast.info(message.title, {
        description: message.description,
        duration: 3000,
      });
    }
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
