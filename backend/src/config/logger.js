// src/config/logger.js
import winston from "winston";
import { config } from "./index.js";

const { combine, timestamp, colorize, printf, json } = winston.format;

const devFormat = printf(({ level, message, timestamp, ...meta }) => {
  const metaStr = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : "";
  return `${timestamp} [${level}] ${message}${metaStr}`;
});

export const logger = winston.createLogger({
  level: config.nodeEnv === "development" ? "debug" : "info",
  format:
    config.nodeEnv === "development"
      ? combine(colorize(), timestamp({ format: "HH:mm:ss" }), devFormat)
      : combine(timestamp(), json()),
  transports: [new winston.transports.Console()],
});
