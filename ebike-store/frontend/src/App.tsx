import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { RequireAdmin, RequireAuth } from './components/Guards'
import { Layout } from './components/Layout'
import { PageLoader } from './components/ui'
import Home from './pages/Home'
import Shop from './pages/Shop'
import ProductDetail from './pages/ProductDetail'
import CartPage from './pages/Cart'
import Checkout from './pages/Checkout'
import PayTest from './pages/PayTest'
import OrderStatus from './pages/OrderStatus'
import { Login, Register } from './pages/Auth'
import Account, { OrderHistory } from './pages/Account'
import { About, Contact, NotFound } from './pages/Static'

// The admin area is loaded only when needed, so customers download less JavaScript.
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'))
const AdminLogin = lazy(() => import('./pages/admin/AdminLogin'))
const Dashboard = lazy(() => import('./pages/admin/Dashboard'))
const Products = lazy(() => import('./pages/admin/Products'))
const ProductForm = lazy(() => import('./pages/admin/ProductForm'))
const ProductPreview = lazy(() => import('./pages/admin/ProductPreview'))
const Inventory = lazy(() => import('./pages/admin/Inventory'))
const AdminOrders = lazy(() => import('./pages/admin/Orders').then((m) => ({ default: m.AdminOrders })))
const AdminOrderDetail = lazy(() => import('./pages/admin/Orders').then((m) => ({ default: m.AdminOrderDetail })))
const Categories = lazy(() => import('./pages/admin/Misc').then((m) => ({ default: m.Categories })))
const Discounts = lazy(() => import('./pages/admin/Misc').then((m) => ({ default: m.Discounts })))
const Reviews = lazy(() => import('./pages/admin/Misc').then((m) => ({ default: m.Reviews })))
const AuditLog = lazy(() => import('./pages/admin/Misc').then((m) => ({ default: m.AuditLog })))

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="shop" element={<Shop />} />
          <Route path="product/:slug" element={<ProductDetail />} />
          <Route path="cart" element={<CartPage />} />
          <Route path="checkout" element={<Checkout />} />
          <Route path="pay/test/:number" element={<PayTest />} />
          <Route path="order/:number" element={<OrderStatus />} />
          <Route path="login" element={<Login />} />
          <Route path="register" element={<Register />} />
          <Route path="about" element={<About />} />
          <Route path="contact" element={<Contact />} />
          <Route element={<RequireAuth />}>
            <Route path="account" element={<Account />} />
            <Route path="account/orders" element={<OrderHistory />} />
            <Route path="account/orders/:number" element={<OrderStatus />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route path="admin/login" element={<AdminLogin />} />
        <Route path="admin" element={<RequireAdmin />}>
          <Route element={<AdminLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="products" element={<Products />} />
            <Route path="products/new" element={<ProductForm />} />
            <Route path="products/:id" element={<ProductForm />} />
            <Route path="products/:id/preview" element={<ProductPreview />} />
            <Route path="categories" element={<Categories />} />
            <Route path="inventory" element={<Inventory />} />
            <Route path="orders" element={<AdminOrders />} />
            <Route path="orders/:number" element={<AdminOrderDetail />} />
            <Route path="discounts" element={<Discounts />} />
            <Route path="reviews" element={<Reviews />} />
            <Route path="audit" element={<AuditLog />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  )
}
