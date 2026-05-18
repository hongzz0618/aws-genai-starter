# 🤖 GenAI on AWS — Starter Project

This is a clean, real-world example of building a GenAI service on AWS, step by step.

We start small and grow safely:
- A minimal serverless API (API Gateway → Lambda)
- Then add DynamoDB, Bedrock model calls, CI/CD, and observability

**Goal:** learn by building, keep it simple, ship value early, and improve in small steps.

---

## ✅ What’s included

- Serverless API with API Gateway + Lambda
- Chat history stored in DynamoDB
- Bedrock model invocation from Lambda
- CI/CD with GitHub Actions using OIDC
- Observability: logs, metrics, alarms, cost controls

---

## 🛣️ Roadmap (completed)

1. ✅ Minimal serverless API  
2. ✅ Add DynamoDB for chat history  
3. ✅ Call Amazon Bedrock from Lambda  
4. ✅ CI/CD with GitHub Actions (OIDC)  
5. ✅ Observability and cost controls (CloudWatch, Budgets, Alarms)

---

## 📁 Project structure

- **/live/dev/**: Terraform environment (dev)
- **/modules/**: Reusable Terraform modules
- **/scripts/**: Lambda packaging script (zip + dependencies)
- **/src/**: Lambda source code (Python)
- **/.github/workflows/**: CI/CD pipeline with GitHub Actions (OIDC)
- **README.md**: Project overview and roadmap

---

## 🧪 How to test it

- Call the API with a JSON payload → get a response from Bedrock
- Check logs and metrics in CloudWatch
- Trigger errors to test alarms
- Monitor cost usage in AWS Budgets

---

## 🙌 Why this project?

It’s a practical, working example of GenAI on AWS.  
Useful for learning, demos, and as a starting point for experimenting with managed model integration on AWS.
