# Honeypot Monitoring System

## Project Description
This project is focused on basic infrastructure security monitoring in a containerized environment. The main idea is to deploy a honeypot service on a Linux server in order to capture unauthorized access attempts, collect logs from both the honeypot and the host system, and visualize suspicious activity through a monitoring dashboard. The solution also includes basic alerting for security-related events and validation through simulated attack scenarios.

## Project Goal
The goal of this project is to build a simple security monitoring environment that can detect, collect, and visualize malicious or suspicious access attempts in real time.

## Project Objectives
- Deploy and configure the project environment on a Linux server
- Containerize and run a honeypot service for capturing unauthorized access attempts
- Configure centralized collection of honeypot and system logs
- Implement monitoring and visualization of attack activity through a dashboard
- Configure basic alerting for suspicious login attempts and security events
- Validate the solution by simulating attack scenarios and analyzing the generated logs and alerts

## Technology Stack
- Linux
- Docker
- Docker Compose
- Cowrie Honeypot
- Grafana or Kibana
- Loki or ELK Stack
- Telegram Bot API

## Expected Result
The final solution should provide a working honeypot environment with centralized log collection, attack visualization, and basic alerting. During the demonstration, simulated attack attempts should generate logs, update the dashboard, and trigger alerts.
