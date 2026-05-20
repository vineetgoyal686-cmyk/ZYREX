export const DEPTS_ALL = [
  { id: 1,  name: "IT Department",      code: "IT",   head: "Rajesh Kumar",   members: 45, active: true  },
  { id: 2,  name: "HR Department",      code: "HR",   head: "Pooja Sharma",   members: 28, active: true  },
  { id: 3,  name: "Finance Department", code: "FIN",  head: "Amit Jain",      members: 22, active: true  },
  { id: 4,  name: "Sales Department",   code: "SALE", head: "Vikram Singh",   members: 38, active: true  },
  { id: 5,  name: "Operations",         code: "OPS",  head: "Priya Patel",    members: 12, active: true  },
  { id: 6,  name: "Procurement",        code: "PROC", head: "Sandeep Rao",    members: 8,  active: true  },
  { id: 7,  name: "Legal",              code: "LEG",  head: "Karan Malhotra", members: 5,  active: true  },
  { id: 8,  name: "Marketing",          code: "MKT",  head: "Neha Verma",     members: 10, active: true  },
  { id: 9,  name: "R&D",                code: "RND",  head: "—",              members: 7,  active: true  },
  { id: 10, name: "Admin",              code: "ADM",  head: "—",              members: 6,  active: true  },
  { id: 11, name: "Security",           code: "SEC",  head: "—",              members: 4,  active: true  },
  { id: 12, name: "QA",                 code: "QA",   head: "Neha Verma",     members: 8,  active: false },
];

export const DESIG_ALL = [
  { id: 1,  title: "CEO",                  dept: "Management",    level: 1, active: true  },
  { id: 2,  title: "CTO",                  dept: "IT Department", level: 2, active: true  },
  { id: 3,  title: "HR Head",              dept: "HR Department", level: 2, active: true  },
  { id: 4,  title: "Finance Head",         dept: "Finance",       level: 2, active: true  },
  { id: 5,  title: "Dev Manager",          dept: "IT Department", level: 3, active: true  },
  { id: 6,  title: "QA Manager",           dept: "IT Department", level: 3, active: true  },
  { id: 7,  title: "HR Manager",           dept: "HR Department", level: 3, active: true  },
  { id: 8,  title: "Accounts Manager",     dept: "Finance",       level: 3, active: true  },
  { id: 9,  title: "Finance Manager",      dept: "Finance",       level: 3, active: true  },
  { id: 10, title: "Sales Head",           dept: "Sales",         level: 2, active: true  },
  { id: 11, title: "Operations Head",      dept: "Operations",    level: 2, active: true  },
  { id: 12, title: "Marketing Head",       dept: "Marketing",     level: 2, active: true  },
  { id: 13, title: "UI/UX Designer",       dept: "IT Department", level: 4, active: true  },
  { id: 14, title: "Developer",            dept: "IT Department", level: 4, active: true  },
  { id: 15, title: "HR Executive",         dept: "HR Department", level: 4, active: true  },
  { id: 16, title: "Accountant",           dept: "Finance",       level: 4, active: true  },
  { id: 17, title: "Sales Executive",      dept: "Sales",         level: 4, active: false },
  { id: 18, title: "Operations Executive", dept: "Operations",    level: 4, active: false },
];

export const TEAMS_ALL = [
  { id: 1,  name: "Frontend Team",    dept: "IT",          lead: "Vikram Singh",   members: 12 },
  { id: 2,  name: "Backend Team",     dept: "IT",          lead: "Vikram Singh",   members: 8  },
  { id: 3,  name: "QA Team",          dept: "IT",          lead: "Neha Verma",     members: 8  },
  { id: 4,  name: "DevOps Team",      dept: "IT",          lead: "—",              members: 4  },
  { id: 5,  name: "Recruitment Team", dept: "HR",          lead: "Priya Patel",    members: 6  },
  { id: 6,  name: "L&D Team",         dept: "HR",          lead: "—",              members: 4  },
  { id: 7,  name: "Accounts Team",    dept: "Finance",     lead: "Sandeep Rao",    members: 7  },
  { id: 8,  name: "Payroll Team",     dept: "Finance",     lead: "Karan Malhotra", members: 6  },
  { id: 9,  name: "Sales North",      dept: "Sales",       lead: "—",              members: 10 },
  { id: 10, name: "Sales South",      dept: "Sales",       lead: "—",              members: 10 },
  { id: 11, name: "Sales East",       dept: "Sales",       lead: "—",              members: 9  },
  { id: 12, name: "Sales West",       dept: "Sales",       lead: "—",              members: 9  },
  { id: 13, name: "Site Ops",         dept: "Operations",  lead: "—",              members: 12 },
  { id: 14, name: "Logistics",        dept: "Operations",  lead: "—",              members: 8  },
  { id: 15, name: "Content Team",     dept: "Marketing",   lead: "Neha Verma",     members: 5  },
  { id: 16, name: "Design Team",      dept: "Marketing",   lead: "—",              members: 4  },
  { id: 17, name: "R&D Alpha",        dept: "R&D",         lead: "—",              members: 4  },
  { id: 18, name: "R&D Beta",         dept: "R&D",         lead: "—",              members: 3  },
  { id: 19, name: "Admin Support",    dept: "Admin",       lead: "—",              members: 6  },
  { id: 20, name: "Security Team",    dept: "Security",    lead: "—",              members: 4  },
  { id: 21, name: "Legal Advisory",   dept: "Legal",       lead: "Karan Malhotra", members: 3  },
  { id: 22, name: "Procurement Team", dept: "Procurement", lead: "Sandeep Rao",    members: 8  },
  { id: 23, name: "Archive Team",     dept: "Admin",       lead: "—",              members: 2  },
  { id: 24, name: "Audit Team",       dept: "Finance",     lead: "—",              members: 3  },
];

export const LOCATIONS_ALL = [
  { id: 1, name: "Head Office",  city: "Mumbai", type: "HQ",     active: true  },
  { id: 2, name: "Branch Delhi", city: "Delhi",  type: "Branch", active: true  },
  { id: 3, name: "Branch Pune",  city: "Pune",   type: "Branch", active: true  },
  { id: 4, name: "Site Alpha",   city: "Nashik", type: "Site",   active: true  },
  { id: 5, name: "Site Beta",    city: "Nagpur", type: "Site",   active: true  },
];

export const ORG_TREE = {
  id: 1, name: "Ankit Mehta", role: "CEO", level: 1, color: "bg-slate-700",
  children: [
    {
      id: 2, name: "Rajesh Kumar", role: "CTO", level: 2, color: "bg-blue-600",
      children: [
        { id: 5, name: "Vikram Singh",   role: "Dev Manager",      level: 3, color: "bg-orange-500", teamMembers: 12, children: [] },
        { id: 6, name: "Neha Verma",     role: "QA Manager",       level: 3, color: "bg-purple-500", teamMembers: 8,  children: [] },
      ],
    },
    {
      id: 3, name: "Pooja Sharma", role: "HR Head", level: 2, color: "bg-pink-500",
      children: [
        { id: 7, name: "Priya Patel",    role: "HR Manager",       level: 3, color: "bg-sky-500",     teamMembers: 6, children: [] },
      ],
    },
    {
      id: 4, name: "Amit Jain", role: "Finance Head", level: 2, color: "bg-teal-600",
      children: [
        { id: 8, name: "Sandeep Rao",    role: "Accounts Manager", level: 3, color: "bg-teal-500",    teamMembers: 7, children: [] },
        { id: 9, name: "Karan Malhotra", role: "Finance Manager",  level: 3, color: "bg-emerald-600", teamMembers: 6, children: [] },
      ],
    },
  ],
};

export const DEPT_CHART_DATA = [
  { name: "IT Department",      value: 45, pct: "28.8%", color: "#3b82f6" },
  { name: "HR Department",      value: 28, pct: "17.9%", color: "#8b5cf6" },
  { name: "Finance Department", value: 22, pct: "14.1%", color: "#10b981" },
  { name: "Sales Department",   value: 38, pct: "24.4%", color: "#f59e0b" },
  { name: "Others",             value: 23, pct: "14.7%", color: "#ef4444" },
];

export const RECENT_HIRES = [
  { name: "Rohit Sharma", role: "UI/UX Designer", dept: "IT Department",      date: "2 May, 2024",  color: "bg-blue-500"   },
  { name: "Sneha Iyer",   role: "HR Executive",   dept: "HR Department",      date: "1 May, 2024",  color: "bg-purple-500" },
  { name: "Arjun Kapoor", role: "Accountant",     dept: "Finance Department", date: "30 Apr, 2024", color: "bg-teal-500"   },
];

export const LEAVES_TODAY = [
  { name: "Neha Verma",   role: "QA Manager", type: "Sick Leave",   typeCls: "bg-red-100 text-red-600",       color: "bg-purple-500" },
  { name: "Rahul Singh",  role: "Developer",  type: "Casual Leave", typeCls: "bg-orange-100 text-orange-600",  color: "bg-slate-600"  },
  { name: "Pooja Sharma", role: "HR Head",    type: "Earned Leave", typeCls: "bg-green-100 text-green-700",    color: "bg-pink-500"   },
];
