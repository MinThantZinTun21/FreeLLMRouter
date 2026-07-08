# Terms of Service

**Last Updated:** January 2026

## 1. Overview

Free LLM Router provides community-powered health data for large language models. This service is provided free of charge on an as-is basis.

## 2. Usage Rights and Restrictions

### Permitted Use

- Query available LLM models and their metadata
- Submit success and failure reports about model performance
- Access community health metrics (24-hour window)
- Use the API with your API key for development and production

### Rate Limits

- **Free Tier:** 200 requests per 24 hours per user
- **API Keys:** Maximum 10 active API keys per account

### Prohibited Use

- Attempting to circumvent rate limits through multiple accounts
- Automated scraping or crawling (use the API instead)
- Submitting false or misleading health reports
- Using the service for illegal activities
- Reverse engineering or attempting to break the service

## 3. Data and Privacy

### What We Collect

- API usage logs (endpoint, timestamp, response time)
- API key metadata (creation date, last used, request count)
- User email address and GitHub account info
- Model health feedback (success/failure reports)

### What We Share

- **Public Health Data:** Aggregated model performance metrics are available to all users (without authentication)
- **User-Scoped Data:** Your personal health reports are only visible to you unless you explicitly share them
- **Usage Analytics:** We may analyze aggregated usage patterns to improve the service

### Data Retention

- Request logs: Retained for 30 days for performance monitoring
- Health feedback: Retained indefinitely as part of model health history
- User accounts: Retained until account deletion

## 4. Hosted vs. Self-Hosted

### Hosted Instance (freellmrouter.com)

- Subject to these Terms of Service
- Managed by the Free LLM Router team
- Automatic model updates and health scoring
- Community health data access

### Self-Hosted

- MIT licensed code available on GitHub
- You maintain your own instance
- You control data retention and privacy
- Can read community health data via our public API (with rate limits)
- Cannot contribute to shared health data pool from self-hosted instances

## 5. Health Data Methodology

We aggregate model health reports from authenticated users:

- **Success Reports:** "This model worked well for my use case"
- **Issue Reports:** Rate limiting, unavailability, or errors encountered
- **Community Aggregation:** We calculate error rates and reliability metrics across all reports

**Important:** Health data reflects community experiences. Always test models in your own environment before production use.

## 6. Disclaimers

### No Warranty

The service is provided "AS IS" without warranty of any kind. We do not guarantee:

- Uptime or availability
- Accuracy of health metrics
- That models will behave as reported by other users

### No Liability

We are not responsible for:

- Model failures or unexpected behavior
- Data loss or corruption
- Costs incurred from API usage
- Third-party service failures (OpenRouter, etc.)

## 7. Changes to Terms

We may update these terms at any time. Continued use of the service constitutes acceptance of new terms.

## 8. Account Termination

We reserve the right to terminate accounts that:

- Violate these terms
- Submit false health data repeatedly
- Attempt to circumvent rate limits
- Use the service for illegal purposes

## 9. Contact

Questions about these terms? Open an issue or discussion on GitHub.

---

By using Free LLM Router, you agree to these terms of service.
