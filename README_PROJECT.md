# 🍺 Beer Voucher Tracker

A sophisticated, editorial-designed web application for tracking daily beer voucher statistics, analyzing performance trends, and automatically delivering reports to Microsoft Teams every morning at 8 AM UTC.

## 📋 Features

### Daily Voucher Entry
- **Real-time Formula Validation:** Ensures Total Issued = Posted Bills + Cancelled
- **User-Friendly Form:** Date picker and numeric inputs with clear validation messages
- **Instant Feedback:** Success/error notifications on submission

### KPI Dashboard
- **Today's Performance:** Real-time metrics displayed in elegant KPI cards
  - Total Vouchers Issued
  - Vouchers with Posted Bills
  - Cancelled Vouchers
  - Utilization Rate (%)
- **Live Updates:** Auto-refreshes every 30 seconds

### Historical Data Analysis
- **Comprehensive Table:** Browse all recorded voucher data
- **Flexible Filtering:** Filter by custom date ranges
- **Quick Presets:** Last 7 days, Last 30 days buttons
- **Sortable Columns:** Click headers to sort data

### Performance Analytics
- **Bar Charts:** Daily voucher distribution visualization
- **Line Charts:** Utilization rate trends over time
- **7-Day Analysis:** Average metrics and period statistics
- **Interactive Filters:** Adjust date ranges to explore trends

### Admin Settings
- **MS Teams Integration:** Configure webhook URL for automated reports
- **Secure Storage:** Admin-only access with encryption
- **URL Validation:** Automatic format checking
- **Help Documentation:** Built-in setup instructions

### Automated Reporting
- **Daily Cron Job:** Runs automatically at 8:00 AM UTC
- **Previous Day Data:** Compiles yesterday's complete statistics
- **Trend Analysis:** Includes 7-day performance metrics
- **MS Teams Format:** Adaptive Card with professional formatting
- **Error Handling:** Graceful fallback if webhook not configured

---

## 🎨 Design Aesthetic

The application embodies a **sophisticated editorial aesthetic** with:

- **Cream Background:** Minimalist, high-contrast color palette
- **Didone Serif Typography:** Bold, elegant headlines with fine serif subheadings
- **Geometric Lines:** Fine decorative elements for structural refinement
- **Generous Negative Space:** Asymmetrical, balanced layout
- **Responsive Design:** Mobile-first approach with thoughtful breakpoints
- **High Readability:** Carefully chosen typography and spacing

---

## 🛠️ Technology Stack

### Frontend
- **React 19** - UI framework
- **Tailwind CSS 4** - Utility-first styling
- **Recharts** - Interactive data visualization
- **shadcn/ui** - Accessible component library
- **Vite** - Fast build tool

### Backend
- **Express.js** - Web server
- **tRPC** - Type-safe API framework
- **Drizzle ORM** - Database query builder
- **MySQL/TiDB** - Database

### Testing
- **Vitest** - Unit testing framework
- **13 comprehensive tests** - Full coverage of procedures and validation

---

## 📊 Database Schema

### voucher_records Table
```sql
- id (int, primary key)
- date (varchar, unique)
- totalIssued (int)
- postedBills (int)
- cancelled (int)
- utilizationRate (int)
- createdAt (timestamp)
- updatedAt (timestamp)
```

### settings Table
```sql
- id (int, primary key)
- key (varchar, unique)
- value (longtext)
- createdAt (timestamp)
- updatedAt (timestamp)
```

### users Table (Manus OAuth)
```sql
- id (int, primary key)
- openId (varchar, unique)
- name (text)
- email (varchar)
- loginMethod (varchar)
- role (enum: 'user' | 'admin')
- createdAt (timestamp)
- updatedAt (timestamp)
- lastSignedIn (timestamp)
```

---

## 🔐 Security Features

### Access Control
- **Admin-Only Settings:** Only administrators can configure MS Teams webhook
- **Role-Based Procedures:** Delete operations restricted to admins
- **Authentication Required:** All data mutations require login

### Data Protection
- **Webhook URL Encryption:** Sensitive URLs stored securely
- **No Hardcoding:** Configuration via secure admin interface
- **Input Validation:** All inputs validated server-side

### Cron Job Security
- **Heartbeat Authentication:** Cron jobs verified via Manus tokens
- **Previous Day Only:** No real-time data exposure
- **Error Logging:** All failures logged for monitoring

---

## 📱 User Roles

### Regular User
- ✅ View today's KPI dashboard
- ✅ Enter daily voucher data
- ✅ View historical data and analytics
- ❌ Cannot configure admin settings
- ❌ Cannot delete records

### Administrator
- ✅ All regular user permissions
- ✅ Configure MS Teams webhook URL
- ✅ Delete voucher records
- ✅ Manage application settings
- ✅ View all admin controls

---

## 🚀 Getting Started

### Local Development

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Start dev server:**
   ```bash
   pnpm run dev
   ```

3. **Run tests:**
   ```bash
   pnpm test
   ```

4. **Build for production:**
   ```bash
   pnpm run build
   ```

### Environment Variables

Required environment variables (auto-injected by Manus):
- `DATABASE_URL` - MySQL connection string
- `JWT_SECRET` - Session signing secret
- `VITE_APP_ID` - OAuth application ID
- `OAUTH_SERVER_URL` - OAuth backend URL
- `BUILT_IN_FORGE_API_KEY` - Manus API key

---

## 📝 API Endpoints

### Public Endpoints
- `GET /api/trpc/voucher.getToday` - Get today's record
- `GET /api/trpc/voucher.getByDateRange` - Get records by date range
- `GET /api/trpc/voucher.getPreviousDay` - Get previous day's record

### Protected Endpoints
- `POST /api/trpc/voucher.upsert` - Create/update voucher record
- `POST /api/trpc/voucher.delete` - Delete voucher record (admin only)
- `POST /api/trpc/settings.set` - Update settings (admin only)
- `GET /api/trpc/settings.get` - Get settings (admin only)
- `POST /api/trpc/settings.delete` - Delete settings (admin only)

### Scheduled Endpoints
- `POST /api/scheduled/daily-report` - Daily report generation (cron only)

---

## 📊 Data Flow

```
User Entry
    ↓
Form Validation (Client-side)
    ↓
tRPC Procedure (Server-side)
    ↓
Formula Validation (Total = Posted + Cancelled)
    ↓
Database Insert/Update
    ↓
Dashboard Refresh
    ↓
Analytics Update
    ↓
[Daily at 8 AM UTC]
    ↓
Cron Job Trigger
    ↓
Fetch Previous Day Data
    ↓
Calculate 7-Day Trends
    ↓
Format MS Teams Card
    ↓
POST to Webhook
    ↓
MS Teams Notification
```

---

## 🧪 Testing

### Running Tests
```bash
pnpm test
```

### Test Coverage
- ✅ Formula validation (Total = Posted Bills + Cancelled)
- ✅ Admin role-based access control
- ✅ CRUD operations (Create, Read, Update, Delete)
- ✅ Settings management
- ✅ Authentication requirements
- ✅ Error handling

### Test Results
- **13 tests** - All passing ✓
- **2 test files** - server/voucher.test.ts, server/auth.logout.test.ts

---

## 📖 Documentation

- **DEPLOYMENT_GUIDE.md** - Complete deployment and setup instructions
- **Inline Comments** - Code is well-commented for maintainability
- **Type Safety** - Full TypeScript support with tRPC types

---

## 🔧 Troubleshooting

### WebSocket HMR Connection Error
**Solution:** Restart dev server with `webdev_restart_server`

### Formula Validation Failing
**Solution:** Ensure Total Issued = Posted Bills + Cancelled exactly

### Cron Job Not Running
**Solution:** Verify webhook URL is configured in Admin Settings

### MS Teams Webhook Error
**Solution:** Check webhook URL format and regenerate if needed

---

## 📞 Support

For issues or questions:
1. Check DEPLOYMENT_GUIDE.md for setup instructions
2. Review error messages in Management UI logs
3. Contact Manus support at https://help.manus.im

---

## 📄 License

MIT License - See LICENSE file for details

---

## 🎯 Roadmap

Future enhancements:
- [ ] Export reports to PDF/Excel
- [ ] Email report delivery option
- [ ] Custom date range reports
- [ ] Slack integration
- [ ] Data visualization improvements
- [ ] Mobile app version

---

**Last Updated:** 2026-07-22  
**Version:** 1.0.0  
**Status:** Production Ready ✅
