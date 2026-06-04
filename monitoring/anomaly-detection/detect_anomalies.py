#!/usr/bin/env python3
import os
import sys
import time
import urllib.request
import urllib.error
import math
import json
from collections import deque

# Configuration
METRICS_URL = os.getenv("NYX_METRICS_URL", "http://localhost:3010/api/v1/metrics?format=prometheus")
POLL_INTERVAL = int(os.getenv("NYX_MONITOR_INTERVAL", "10"))  # seconds
WINDOW_SIZE = int(os.getenv("NYX_MONITOR_WINDOW", "30"))  # number of observations
Z_THRESHOLD = float(os.getenv("NYX_MONITOR_Z_THRESHOLD", "3.0"))
ALERT_LOG_PATH = os.getenv("NYX_ALERT_LOG_PATH", "monitoring/anomaly-detection/anomalies.log")
WEBHOOK_URL = os.getenv("NYX_ALERT_WEBHOOK_URL", "")

# Ensure directories exist
os.makedirs(os.path.dirname(ALERT_LOG_PATH) or ".", exist_ok=True)

# Telemetry buffers
history = {
    "event_loop_lag": deque(maxlen=WINDOW_SIZE),
    "memory_rss": deque(maxlen=WINDOW_SIZE),
    "cpu_seconds": deque(maxlen=WINDOW_SIZE),
}

# Keep track of last CPU scrape
last_cpu_time = None
last_cpu_value = None

def parse_prometheus_metrics(raw_text):
    metrics = {}
    for line in raw_text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        # Split on whitespace/curly braces to extract key and value
        # e.g., nyx_process_resident_memory_bytes 1.4589952e+08
        # or nyx_system_health_status 1
        parts = line.split()
        if len(parts) >= 2:
            key_part = parts[0]
            val_part = parts[-1]
            try:
                # Remove labels for key matching (e.g. key{label="val"} -> key)
                metric_name = key_part.split('{')[0]
                metrics[metric_name] = float(val_part)
            except ValueError:
                continue
    return metrics

def calculate_stats(data_deque):
    if len(data_deque) < 5:
        return None, None
    mean = sum(data_deque) / len(data_deque)
    variance = sum((x - mean) ** 2 for x in data_deque) / len(data_deque)
    std_dev = math.sqrt(variance)
    return mean, std_dev

def log_alert(message, alert_type="WARNING"):
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    formatted_msg = f"[{timestamp}] [{alert_type}] {message}"
    print(formatted_msg, file=sys.stderr if alert_type == "CRITICAL" else sys.stdout)
    
    # Write to alert log file
    try:
        with open(ALERT_LOG_PATH, "a") as f:
            f.write(formatted_msg + "\n")
    except Exception as e:
        print(f"Failed to write to alert log: {e}", file=sys.stderr)

    # Trigger webhook if configured
    if WEBHOOK_URL:
        payload = json.dumps({
            "text": formatted_msg,
            "type": alert_type,
            "timestamp": timestamp
        }).encode("utf-8")
        req = urllib.request.Request(
            WEBHOOK_URL,
            data=payload,
            headers={"Content-Type": "application/json"}
        )
        try:
            with urllib.request.urlopen(req, timeout=3) as response:
                response.read()
        except Exception as e:
            print(f"Webhook execution failed: {e}", file=sys.stderr)

def check_anomaly(metric_name, current_val, history_deque, min_std=0.01, min_val_threshold=0.0):
    if len(history_deque) < 5:
        history_deque.append(current_val)
        return
    
    mean, std = calculate_stats(history_deque)
    # Add new observation to history
    history_deque.append(current_val)
    
    if mean is None:
        return
    
    # Avoid division by near-zero std dev for stable metrics
    effective_std = max(std, min_std)
    z_score = (current_val - mean) / effective_std
    
    if abs(z_score) > Z_THRESHOLD and current_val > min_val_threshold:
        log_alert(
            f"Anomaly detected in {metric_name}: current value {current_val:.4f} is {z_score:.2f} standard deviations away from historical mean {mean:.4f} (std: {std:.4f})",
            "WARNING"
        )

def poll_metrics():
    global last_cpu_time, last_cpu_value
    try:
        with urllib.request.urlopen(METRICS_URL, timeout=5) as response:
            html = response.read().decode('utf-8')
    except urllib.error.URLError as e:
        log_alert(f"Failed to fetch metrics from {METRICS_URL}: {e.reason}", "CRITICAL")
        return
    except Exception as e:
        log_alert(f"Error fetching metrics: {e}", "CRITICAL")
        return

    metrics = parse_prometheus_metrics(html)
    
    # 1. System Health Status Check
    health_status = metrics.get("nyx_system_health_status", 1.0)
    if health_status == 0.0:
        log_alert("NYX System Health check is CRITICAL (down). Checks failed.", "CRITICAL")
    elif health_status == 0.5:
        log_alert("NYX System Health check is DEGRADED. Some dependencies are unhealthy.", "WARNING")

    # 2. Event loop lag check
    lag = metrics.get("nyx_nodejs_eventloop_lag_seconds", 0.0)
    if lag > 1.0:
        log_alert(f"Critical Event Loop Lag detected: {lag * 1000:.2f} ms", "CRITICAL")
    # check anomaly (Z-score) for event loop lag, using a minimum value threshold of 50ms (0.05s) to avoid spamming tiny variations
    check_anomaly("Event Loop Lag (s)", lag, history["event_loop_lag"], min_std=0.01, min_val_threshold=0.05)

    # 3. Memory usage check (convert bytes to MB)
    rss_bytes = metrics.get("nyx_process_resident_memory_bytes", 0.0)
    rss_mb = rss_bytes / 1024 / 1024
    if rss_mb > 1500:  # > 1.5 GB
        log_alert(f"High memory usage detected: {rss_mb:.2f} MB", "WARNING")
    # check anomaly (Z-score) for RSS memory, minimum std dev of 10MB
    check_anomaly("Resident Memory (MB)", rss_mb, history["memory_rss"], min_std=10.0, min_val_threshold=100.0)

    # 4. CPU usage calculation from CPU seconds total
    cpu_seconds = metrics.get("nyx_process_cpu_seconds_total", 0.0)
    current_time = time.time()
    if last_cpu_time is not None and last_cpu_value is not None:
        time_diff = current_time - last_cpu_time
        cpu_diff = cpu_seconds - last_cpu_value
        if time_diff > 0:
            cpu_usage_pct = (cpu_diff / time_diff) * 100
            if cpu_usage_pct > 80.0:
                log_alert(f"High CPU usage detected: {cpu_usage_pct:.2f}%", "WARNING")
            check_anomaly("CPU Usage (%)", cpu_usage_pct, history["cpu_seconds"], min_std=5.0, min_val_threshold=10.0)
            
    last_cpu_time = current_time
    last_cpu_value = cpu_seconds

def main():
    print(f"Starting NYX Anomaly Detection Daemon...")
    print(f"Monitoring metrics from: {METRICS_URL}")
    print(f"Polling interval: {POLL_INTERVAL} seconds, Window size: {WINDOW_SIZE}")
    print(f"Alert log file: {ALERT_LOG_PATH}")
    
    # Warm up / poll once
    poll_metrics()
    
    while True:
        try:
            time.sleep(POLL_INTERVAL)
            poll_metrics()
        except KeyboardInterrupt:
            print("\nShutting down Anomaly Detection Daemon...")
            break
        except Exception as e:
            log_alert(f"Unexpected monitoring daemon error: {e}", "CRITICAL")
            time.sleep(POLL_INTERVAL)

if __name__ == "__main__":
    main()
