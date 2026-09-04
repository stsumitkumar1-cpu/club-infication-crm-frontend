import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './app/providers/AuthProvider';
import ProtectedRoute from './app/router/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import DashboardLayout from './layouts/DashboardLayout';
import DashboardPage from './pages/DashboardPage';
import UsersPage from './pages/UsersPage';
import TeamsPage from './pages/TeamsPage';
import CustomersPage from './pages/CustomersPage';
import CustomerDetailPage from './pages/CustomerDetailPage';
import PackagesPage from './pages/PackagesPage';
import ProfilePage from './pages/ProfilePage';
import MiscellaneousExpensesPage from './pages/MiscellaneousExpensesPage';
import SalariesIncentivesPage from './pages/SalariesIncentivesPage';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          {/* Everything below requires a valid session. */}
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<DashboardLayout />}>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="customers" element={<CustomersPage />} />
              <Route path="customers/:id" element={<CustomerDetailPage />} />
              {/* Plan catalog: everyone reads it, Super Admin edits it. */}
              <Route path="packages" element={<PackagesPage />} />
              <Route path="miscellaneous-expenses" element={<MiscellaneousExpensesPage />} />
              <Route path="salaries-incentives" element={<SalariesIncentivesPage />} />
              {/* Every signed-in role has a profile — it is their own record. */}
              <Route path="profile" element={<ProfilePage />} />

              {/* Super Admin manages all users; a Manager may onboard
                  Executives into their own team. Executives have no access. */}
              <Route
                element={
                  <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'MANAGER']} />
                }
              >
                <Route path="users" element={<UsersPage />} />
              </Route>

              {/* Team structure: Super Admin (all teams) and Manager (own). */}
              <Route
                element={
                  <ProtectedRoute allowedRoles={['SUPER_ADMIN', 'MANAGER']} />
                }
              >
                <Route path="teams" element={<TeamsPage />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
