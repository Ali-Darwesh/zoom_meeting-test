# Zoom Meeting Integration API (Clean Architecture)

A robust, highly scalable Node.js API for managing Zoom meetings. Built with **Clean Architecture** principles, this project implements asynchronous processing, caching strategies, and OAuth 2.0 integrations to ensure enterprise-grade performance and fault tolerance.

## 🚀 Key Features
* **Clean Architecture:** Strict separation of concerns (Domain, Application, Infrastructure, Presentation).
* **Asynchronous Queues:** Uses `BullMQ` and `Redis` to handle meeting creation in the background, preventing API blocking and ensuring fast response times (202 Accepted).
* **Caching Strategy:** Caches Zoom API responses using `Redis` to avoid rate limits and reduce latency.
* **Automated Sync:** Two-way synchronization between the local database and Zoom servers.
* **OAuth 2.0 Flow:** Secure user authorization with Zoom.
* **Security & IDOR Protection:** Strict security checks ensuring users can only manage their own meetings.
* **Result Object Pattern:** Predictable error handling without relying on generic try/catch throws in the presentation layer.

---

## 🛠️ Prerequisites
Before running the project, ensure you have the following installed:
* [Node.js](https://nodejs.org/) (v16 or higher)
* [Redis Server](https://redis.io/) (Running on default port 6379)
* A Relational Database (PostgreSQL / MySQL) depending on your Prisma configuration.
* A Zoom Developer App (OAuth) with `Client ID` and `Client Secret`.

---

## ⚙️ Setup & Installation

**1. Clone the repository and install dependencies:**
```bash
git clone <repository-url>
cd zoom-meeting-api
npm install
```

**2. Configure Environment Variables:**
Create a `.env` file in the root directory and add your specific configurations:
```env
# Database & Redis
DATABASE_URL="postgresql://user:password@localhost:5432/zoom_db?schema=public"
REDIS_URL="redis://127.0.0.1:6379"

# Security Encryption Key (32 characters)
ENCRYPTION_KEY="your-32-character-secret-key-here"

# Zoom OAuth Credentials
ZOOM_CLIENT_ID="your_zoom_client_id"
ZOOM_CLIENT_SECRET="your_zoom_client_secret"
ZOOM_REDIRECT_URI="http://localhost:3000/api/zoom/callback"
```

**3. Setup the Database (Prisma):**
Generate the Prisma client and push the schema to your database.
```bash
npx prisma generate
npx prisma db push
```

**4. Run the Application:**
Start the development server (This will spin up both the Express API and the BullMQ background workers).
```bash
npm start 
```

**5. Run Unit Tests:**
To execute the Jest test suite (with mocked databases and queues):
```bash
npm test
```

---

## 📊 System Diagrams

### 1. Use Case Diagram
*Illustrates the core functionalities available to the user within the system.*

```mermaid

    User([Platform User])

   "Zoom Meeting Management System"
        Auth[Connect Zoom Account via OAuth]
        Schedule[Schedule a New Meeting]
        List[View Live/Upcoming Meetings]
        Delete[Cancel a Meeting]
        Sync[Auto-Sync Local DB with Zoom API]
    

    User --> Auth
    User --> Schedule
    User --> List
    User --> Delete

    List -.->|Triggers background| Sync
    Delete -.->|Cascades to| Sync
```

### 2. Sequence Diagram (Async Meeting Scheduling)
*Demonstrates the complex, non-blocking flow of scheduling a meeting using Background Queues (BullMQ) and the Factory Pattern.*

```mermaid
sequenceDiagram
    autonumber
    actor Client
    participant Controller as MeetingController
    participant Action as ScheduleMeetingAction
    participant Queue as BullMQ (Redis)
    participant Worker as MeetingWorker
    participant Provider as ZoomProvider
    participant DB as Prisma (Database)

    Client->>Controller: POST /meetings/schedule (Payload)
    Controller->>Controller: Input Validation (Joi)
    Controller->>Action: execute(validatedData)
    
    Action->>Queue: addMeetingTask()
    Queue-->>Action: Job Enqueued Successfully
    Action-->>Controller: Return { status: 'queued', success: true }
    Controller-->>Client: 202 Accepted (Processing in background)

    Note over Queue, Worker: --- Asynchronous Background Process ---
    
    Queue->>Worker: Consume Job
    Worker->>Provider: createMeeting(meetingEntity)
    Provider->>Provider: getValidAccessToken(userId)
    Provider->>Zoom API: POST /users/me/meetings
    Zoom API-->>Provider: Zoom Response (join_url, provider_id)
    
    Worker->>DB: save(processedMeeting)
    DB-->>Worker: Database Record Stored
    Worker->>Queue: Mark Job as Completed
```
