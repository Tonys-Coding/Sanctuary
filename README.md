<h1 align="center"> Sanctuary </h1>

<p align="center">
<img width="370" height="370" alt="logo" src="https://github.com/user-attachments/assets/fd50186b-bd4a-4365-ae7e-aaa8b9d8db15" />
</p>


<p align="center"> A full-stack church offering and member management system. Built with React, TypeScript, Node.js, and PostgreSQL </p>

<br>
<br>
<br>
<br>

<h1 align="center">  Overview  </h1>

<p align="center">Sanctuary is a full-stack web application that was built to help churches manage members, track financial offerings, and offer analytics for trends over time. </p>
<p align="center">Sanctuary features a clean, elegant design built around an antique gold and black color scheme. Sanctuary's UI focuses on usability and professional presentation </p>

<br>
<h1 align="center">  Background  </h1>

<p align="center">I have been part of the congregation of my current church for around 5 years, and throughout my time at church I've came across many different opportunies to learn from each 
of the church's own departments. As I came across the treasury department of my church (where offerings are tracked), I noticed that the people in charge were still using traditional 
journals to track everything down. No computers, no software, just a pen and a journal. </p>

<p align="center">As an upcoming software engineer whose passion is web development, I saw this as my perfect opportunity to make a real-world problem solving website for their convenience. </p>

<p align="center">Instead of having to track down every congregation member, calculate their offering total, track dates, and stress about a secure place to hide the journal, a website can do all of that instantly. This inspired me to create a full-stack web application for the Treasury department at my church. </p>

<p align="center">Sanctuary was built to solve all these problems. </p>

<br>
<br>
<br>

<h1 align="center">  Tech Stack  </h1>

## Front-End
| Technology | Purpose |
|---|---|
| React 18 + TypeScript | UI framework |
| Vite | Build tool and dev server |
| Tailwind CSS v4 | Utility-first styling |
| Recharts | Data visualization |
| React Router | Client-side routing |

## Back-End
| Technology | Purpose |
|---|---|
| Node.js + Express | REST API server |
| TypeScript | Type-safe server code |
| PostgreSQL | Relational database |
| Multer | File upload handling |
| JWT | Authentication tokens |

## Project Structure

```
Sanctuary/
├── backend/
│   ├── src/
│   │   ├── controllers/     # Route handler logic
│   │   ├── routes/          # Express route definitions
│   │   ├── middleware/       # Auth and upload middleware
│   │   └── models/          # Database query functions
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── pages/           # Top-level route pages
│   │   ├── components/      # Reusable UI components
│   │   ├── contexts/        # React context providers
│   │   └── utils/           # Helper functions
│   └── package.json
└── README.md
```

## Languages

- TypeScript: 97.4%
- CSS: 1.7%
- Other: 0.9%

# Getting Started

### Prerequisites
<ul>
  <li>Node.js (v18+)</li>
  <li>PostgreSQL (v14+)</li>
  <li>npm</li>
</ul>

### Installation

**1. Clone the repository**
```bash
git clone https://github.com/Tonys-Coding/Sanctuary.git
cd Sanctuary
```

**2. Set up the back-end**
```bash
cd backend
npm install
```

**Create a new `.env` file in the `backend/` directory**
```env
PORT=5001
DATABASE_URL= postgresql://your_user:your_password@localhost:5432/sanctuary
JWT_SECRET=your_secret
```

**Start the back-end server:**
```bash
npm run dev
```

**3. Set up the front-end**
```bash
cd ../frontend
npm install
npm run dev
```

The website will be running at `http://localhost:5173`, the API will be running at `http://localhost:5001`



## Author 
Anthony Salto: [@Tonys-Coding](https://github.com/Tonys-Coding)