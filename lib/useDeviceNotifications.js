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
      console.log(`[useDeviceNotifications] Device state properties:`, Object.keys(deviceState));
      console.log(`[useDeviceNotifications] Full device state:`, deviceState);
      
      // Check if water is already low on initial load and send notification
      if (deviceState.waterLow === true) {
        console.log(`[useDeviceNotifications] Water is already LOW on initial load`);
        sendNotification(NOTIFICATION_TYPES.WATER_LOW, deviceName, null, preferences);
      }
      // Check if temp/humidity sensors already have abnormal values on load
      if (deviceState.tempC === -999 || (deviceState.tempC !== undefined && deviceState.tempC < 0)) {
        console.log(`[useDeviceNotifications] Temperature sensor error on initial load: ${deviceState.tempC}`);
        sendNotification(NOTIFICATION_TYPES.TEMP_ABNORMAL, deviceName, 'Sensor Error', preferences);
      }
      if (deviceState.humidity === -999 || (deviceState.humidity !== undefined && deviceState.humidity < 0)) {
        console.log(`[useDeviceNotifications] Humidity sensor error on initial load: ${deviceState.humidity}`);
        sendNotification(NOTIFICATION_TYPES.HUMIDITY_ABNORMAL, deviceName, 'Sensor Error', preferences);
      }
      
      prevStateRef.current = deviceState;
      return;
    }

    console.log(`[useDeviceNotifications] Checking state changes for ${deviceName}`);
    console.log(`[useDeviceNotifications] Device state properties:`, Object.keys(deviceState));
    console.log(`[useDeviceNotifications] Water state - prev: ${prevState?.waterLow} (alt: ${prevState?.water}), current: ${deviceState?.waterLow} (alt: ${deviceState?.water})`);
    console.log(`[useDeviceNotifications] Temperature - prev: ${prevState?.tempC}, current: ${deviceState?.tempC}`);
    console.log(`[useDeviceNotifications] Humidity - prev: ${prevState?.humidity}, current: ${deviceState?.humidity}`);
    console.log(`[useDeviceNotifications] Preferences loaded:`, preferences);

    // Check for water level changes
    // currWaterLow === true means water IS low (regardless of previous value)
    const currWaterLow = deviceState.waterLow;
    const prevWaterLow = prevState.waterLow;
    if (currWaterLow === true && prevWaterLow !== true) {
      console.log(`[useDeviceNotifications] Water went LOW (prev: ${prevWaterLow})`);
      sendNotification(NOTIFICATION_TYPES.WATER_LOW, deviceName, null, preferences);
    } else if (currWaterLow === false && prevWaterLow === true) {
      console.log(`[useDeviceNotifications] Water went OK`);
      sendNotification(NOTIFICATION_TYPES.WATER_OK, deviceName, null, preferences);
    }

    // Check for heater state changes
    if (prevState.heaterBulb !== undefined && deviceState.heaterBulb !== undefined) {
      if (prevState.heaterBulb === false && deviceState.heaterBulb === true) {
        console.log(`[useDeviceNotifications] Heater turned ON`);
        sendNotification(
          NOTIFICATION_TYPES.HEATER_ON,
          deviceName,
          null,
          preferences
        );
      } else if (prevState.heaterBulb === true && deviceState.heaterBulb === false) {
        console.log(`[useDeviceNotifications] Heater turned OFF`);
        sendNotification(
          NOTIFICATION_TYPES.HEATER_OFF,
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

    // Check for abnormal temperature
    // -999 or negative means sensor error (treated as abnormal)
    // Treat undefined prevState.tempC as "normal" so the first abnormal reading always triggers
    if (deviceState.tempC !== undefined) {
      const TEMP_TRIGGER = deviceState.tempTrigger;
      const TEMP_STOP = deviceState.tempStop;

      const currTempError = deviceState.tempC === -999 || deviceState.tempC < 0;
      // treat undefined prev as normal (not error)
      const prevTempError = prevState.tempC !== undefined && (prevState.tempC === -999 || prevState.tempC < 0);

      const currTempThreshAbnormal = !currTempError && TEMP_TRIGGER !== undefined && TEMP_STOP !== undefined &&
        (deviceState.tempC < TEMP_TRIGGER || deviceState.tempC > TEMP_STOP);
      // treat undefined prev as normal (not threshold-abnormal)
      const prevTempThreshAbnormal = prevState.tempC !== undefined && !prevTempError &&
        TEMP_TRIGGER !== undefined && TEMP_STOP !== undefined &&
        (prevState.tempC < TEMP_TRIGGER || prevState.tempC > TEMP_STOP);

      const currTempAbnormal = currTempError || currTempThreshAbnormal;
      const prevTempAbnormal = prevTempError || prevTempThreshAbnormal;

      if (!prevTempAbnormal && currTempAbnormal) {
        const valueStr = currTempError ? 'Sensor Error' : deviceState.tempC?.toFixed(1);
        console.log(`[useDeviceNotifications] Temperature went ABNORMAL: ${valueStr}`);
        sendNotification(NOTIFICATION_TYPES.TEMP_ABNORMAL, deviceName, valueStr, preferences);
      } else if (prevTempAbnormal && !currTempAbnormal) {
        console.log(`[useDeviceNotifications] Temperature returned to NORMAL: ${deviceState.tempC?.toFixed(1)}°C`);
        sendNotification(NOTIFICATION_TYPES.TEMP_NORMAL, deviceName, deviceState.tempC?.toFixed(1), preferences);
      }
    }

    // Check for abnormal humidity
    // -999 or negative means sensor error (treated as abnormal)
    // Treat undefined prevState.humidity as "normal" so the first abnormal reading always triggers
    if (deviceState.humidity !== undefined) {
      const HUM_TRIGGER = deviceState.humidityTrigger;
      const HUM_STOP = deviceState.humidityStop;

      const currHumError = deviceState.humidity === -999 || deviceState.humidity < 0;
      // treat undefined prev as normal (not error)
      const prevHumError = prevState.humidity !== undefined && (prevState.humidity === -999 || prevState.humidity < 0);

      const currHumThreshAbnormal = !currHumError && HUM_TRIGGER !== undefined && HUM_STOP !== undefined &&
        (deviceState.humidity < HUM_TRIGGER || deviceState.humidity > HUM_STOP);
      // treat undefined prev as normal (not threshold-abnormal)
      const prevHumThreshAbnormal = prevState.humidity !== undefined && !prevHumError &&
        HUM_TRIGGER !== undefined && HUM_STOP !== undefined &&
        (prevState.humidity < HUM_TRIGGER || prevState.humidity > HUM_STOP);

      const currHumAbnormal = currHumError || currHumThreshAbnormal;
      const prevHumAbnormal = prevHumError || prevHumThreshAbnormal;

      if (!prevHumAbnormal && currHumAbnormal) {
        const valueStr = currHumError ? 'Sensor Error' : Math.round(deviceState.humidity);
        console.log(`[useDeviceNotifications] Humidity went ABNORMAL: ${valueStr}`);
        sendNotification(NOTIFICATION_TYPES.HUMIDITY_ABNORMAL, deviceName, valueStr, preferences);
      } else if (prevHumAbnormal && !currHumAbnormal) {
        console.log(`[useDeviceNotifications] Humidity returned to NORMAL: ${Math.round(deviceState.humidity)}%`);
        sendNotification(NOTIFICATION_TYPES.HUMIDITY_NORMAL, deviceName, Math.round(deviceState.humidity), preferences);
      }
    }

    // Update the ref for next comparison
    prevStateRef.current = deviceState;
  }, [deviceState, deviceName, preferences, enabled]);
}
