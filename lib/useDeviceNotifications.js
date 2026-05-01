// @ts-nocheck
"use client";

import { useEffect, useRef } from "react";
import { sendNotification, NOTIFICATION_TYPES } from "@/lib/notificationService";

/**
 * Hook to monitor device state changes and send notifications
 * Call this in device detail pages to automatically send notifications
 */
export function useDeviceNotifications(deviceName, deviceState, preferences, enabled = true) {
  const prevStateRef = useRef(null);

  useEffect(() => {
    if (!enabled || !deviceState || !preferences) {
      console.log(`[useDeviceNotifications] Skipping: enabled=${enabled}, deviceState=${!!deviceState}, preferences=${!!preferences}`);
      return;
    }

    const prevState = prevStateRef.current;
    if (!prevState) {
      console.log(`[useDeviceNotifications] Initializing state ref for ${deviceName}`);
      prevStateRef.current = deviceState;
      return;
    }

    console.log(`[useDeviceNotifications] Checking state changes for ${deviceName}`, { prevState, deviceState });

    // Check for water level changes
    if (prevState.waterLow !== undefined && deviceState.waterLow !== undefined) {
      if (prevState.waterLow === false && deviceState.waterLow === true) {
        // Water went from OK to Low
        sendNotification(
          NOTIFICATION_TYPES.WATER_LOW,
          deviceName,
          null,
          preferences
        );
      } else if (prevState.waterLow === true && deviceState.waterLow === false) {
        // Water went from Low to OK
        sendNotification(
          NOTIFICATION_TYPES.WATER_OK,
          deviceName,
          null,
          preferences
        );
      }
    }

    // Check for egg turner state changes
    if (prevState.eggTurner !== undefined && deviceState.eggTurner !== undefined) {
      if (prevState.eggTurner === false && deviceState.eggTurner === true) {
        console.log(`[useDeviceNotifications] Egg Turner turned ON`);
        sendNotification(
          NOTIFICATION_TYPES.EGG_TURNER_ON,
          deviceName,
          null,
          preferences
        );
      } else if (prevState.eggTurner === true && deviceState.eggTurner === false) {
        console.log(`[useDeviceNotifications] Egg Turner turned OFF`);
        sendNotification(
          NOTIFICATION_TYPES.EGG_TURNER_OFF,
          deviceName,
          null,
          preferences
        );
      }
    }

    // Check for fan state changes
    if (prevState.fan !== undefined && deviceState.fan !== undefined) {
      if (prevState.fan === false && deviceState.fan === true) {
        console.log(`[useDeviceNotifications] Fan turned ON`);
        sendNotification(
          NOTIFICATION_TYPES.FAN_ON,
          deviceName,
          null,
          preferences
        );
      } else if (prevState.fan === true && deviceState.fan === false) {
        console.log(`[useDeviceNotifications] Fan turned OFF`);
        sendNotification(
          NOTIFICATION_TYPES.FAN_OFF,
          deviceName,
          null,
          preferences
        );
      }
    }

    // Check for humidifier state changes
    if (prevState.humidifier !== undefined && deviceState.humidifier !== undefined) {
      if (prevState.humidifier === false && deviceState.humidifier === true) {
        console.log(`[useDeviceNotifications] Humidifier turned ON`);
        sendNotification(
          NOTIFICATION_TYPES.HUMIDIFIER_ON,
          deviceName,
          null,
          preferences
        );
      } else if (prevState.humidifier === true && deviceState.humidifier === false) {
        console.log(`[useDeviceNotifications] Humidifier turned OFF`);
        sendNotification(
          NOTIFICATION_TYPES.HUMIDIFIER_OFF,
          deviceName,
          null,
          preferences
        );
      }
    }

    // Check for abnormal temperature (threshold-based)
    const TEMP_TRIGGER = deviceState.tempTrigger || 37.5;
    const TEMP_STOP = deviceState.tempStop || 38.0;
    const tempIsAbnormal = deviceState.tempC < TEMP_TRIGGER || deviceState.tempC > TEMP_STOP;
    const prevTempIsAbnormal =
      prevState.tempC < TEMP_TRIGGER || prevState.tempC > TEMP_STOP;

    if (prevTempIsAbnormal === false && tempIsAbnormal === true) {
      sendNotification(
        NOTIFICATION_TYPES.TEMP_ABNORMAL,
        deviceName,
        deviceState.tempC?.toFixed(1),
        preferences
      );
    } else if (prevTempIsAbnormal === true && tempIsAbnormal === false) {
      sendNotification(
        NOTIFICATION_TYPES.TEMP_NORMAL,
        deviceName,
        deviceState.tempC?.toFixed(1),
        preferences
      );
    }

    // Check for abnormal humidity (threshold-based)
    const HUM_TRIGGER = deviceState.humidityTrigger || 60;
    const HUM_STOP = deviceState.humidityStop || 65;
    const humIsAbnormal = deviceState.humidity < HUM_TRIGGER || deviceState.humidity > HUM_STOP;
    const prevHumIsAbnormal =
      prevState.humidity < HUM_TRIGGER || prevState.humidity > HUM_STOP;

    if (prevHumIsAbnormal === false && humIsAbnormal === true) {
      sendNotification(
        NOTIFICATION_TYPES.HUMIDITY_ABNORMAL,
        deviceName,
        Math.round(deviceState.humidity),
        preferences
      );
    } else if (prevHumIsAbnormal === true && humIsAbnormal === false) {
      sendNotification(
        NOTIFICATION_TYPES.HUMIDITY_NORMAL,
        deviceName,
        Math.round(deviceState.humidity),
        preferences
      );
    }

    // Update the ref for next comparison
    prevStateRef.current = deviceState;
  }, [deviceState, deviceName, preferences, enabled]);
}
