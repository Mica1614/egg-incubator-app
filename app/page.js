"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Activity, Cpu, ShieldCheck, Zap, Bell, Shield, ArrowRight, CheckCircle2, Menu, X } from "lucide-react";

export default function Home() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#f8fafc] font-sans selection:bg-sky-100 selection:text-sky-900">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 border-b border-slate-100 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#004a87] p-1.5 shadow-sm shadow-[#004a87]/20">
              <Image
                src="/eggcubator3.png"
                alt="Logo"
                width={28}
                height={28}
                className="h-full w-full object-contain brightness-0 invert"
              />
            </div>
            <span className="text-xl font-bold tracking-tight text-[#004a87] uppercase">
              Eggcubator
            </span>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden items-center gap-8 md:flex">
            <Link href="/login" className="text-sm font-semibold text-slate-600 transition hover:text-sky-600">
              Sign In
            </Link>
            <Link
              href="/register"
              className="inline-flex h-10 items-center justify-center rounded-xl bg-[#004a87] px-5 text-sm font-bold text-white shadow-lg shadow-[#004a87]/20 transition hover:bg-[#003a6b] active:scale-95"
            >
              Get Started →
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <div className="flex md:hidden">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="inline-flex items-center justify-center rounded-lg p-2 text-slate-600 hover:bg-slate-100 focus:outline-none"
            >
              {isMenuOpen ? (
                <X className="h-6 w-6" aria-hidden="true" />
              ) : (
                <Menu className="h-6 w-6" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Menu */}
        {isMenuOpen && (
          <div className="border-b border-slate-100 bg-white md:hidden">
            <div className="space-y-1 px-6 pt-2 pb-6">
              <Link
                href="/login"
                className="block rounded-lg px-3 py-2 text-base font-semibold text-slate-600 hover:bg-slate-50 hover:text-sky-600"
                onClick={() => setIsMenuOpen(false)}
              >
                Sign In
              </Link>
              <Link
                href="/register"
                className="mt-4 block w-full rounded-xl bg-[#004a87] px-3 py-3 text-center text-base font-bold text-white shadow-lg shadow-[#004a87]/20 active:scale-95"
                onClick={() => setIsMenuOpen(false)}
              >
                Get Started →
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <header className="relative overflow-hidden px-6 pt-24 pb-20 text-center sm:pt-32 sm:pb-28">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-5xl font-extrabold tracking-tight text-slate-900 sm:text-7xl">
            Monitor, Detect, <br />
            <span className="bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent">
              Protect Every Hatch
            </span>
          </h1>
          <p className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-slate-600">
            Real-time monitoring and smart detection system designed to keep your incubator operations 
            running smoothly with instant alerts and comprehensive analytics.
          </p>
          <div className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/register"
              className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#ff5722] px-8 text-base font-bold text-white shadow-xl shadow-orange-500/25 transition hover:bg-[#f4511e] active:scale-95 sm:w-auto"
            >
              Create Free Account <ArrowRight className="h-5 w-5" />
            </Link>
            <Link
              href="/login"
              className="inline-flex h-14 w-full items-center justify-center rounded-2xl bg-white px-8 text-base font-bold text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50 active:scale-95 sm:w-auto"
            >
              Sign In to Dashboard
            </Link>
          </div>
        </div>
        
        {/* Background Gradients */}
        <div className="pointer-events-none absolute -top-24 -left-24 h-96 w-96 rounded-full bg-sky-100/50 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-orange-50/50 blur-3xl" />
      </header>

      {/* Features Section */}
      <section className="bg-white py-24 sm:py-32">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center">
            <h2 className="text-3xl font-extrabold tracking-tight text-[#004a87] sm:text-4xl">
              Powerful Features
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-slate-500">
              Everything you need to monitor and manage your operations effectively
            </p>
          </div>

          <div className="mt-20 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                title: "Real-Time Monitoring",
                desc: "Track and monitor your incubator operations with live data updates and comprehensive analytics.",
                icon: Activity,
                color: "bg-sky-600",
              },
              {
                title: "Instant Notifications",
                desc: "Receive immediate alerts for readings drift, sensor issues, and critical events via push notifications.",
                icon: Bell,
                color: "bg-indigo-600",
              },
              {
                title: "Secure & Reliable",
                desc: "Platform-grade security with encrypted data storage to protect your valuable batch history.",
                icon: Shield,
                color: "bg-teal-600",
              },
              {
                title: "Quick Response",
                desc: "Fast detection and response system to minimize downtime and maximize hatching success.",
                icon: Zap,
                color: "bg-sky-700",
              },
            ].map((feature, i) => (
              <div
                key={i}
                className="group relative rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-100 transition-all hover:-translate-y-1 hover:shadow-xl hover:ring-sky-100"
              >
                <div className={`inline-flex h-12 w-12 items-center justify-center rounded-xl ${feature.color} text-white shadow-lg shadow-sky-500/20`}>
                  <feature.icon className="h-6 w-6" />
                </div>
                <h3 className="mt-6 text-lg font-bold tracking-tight text-[#004a87]">
                  {feature.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-500">
                  {feature.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Choose Section */}
      <section className="bg-[#f8fafc] py-24 sm:py-32">
        <div className="mx-auto max-w-5xl px-6">
          <div className="relative overflow-hidden rounded-[2.5rem] bg-white p-8 shadow-2xl shadow-slate-200/50 ring-1 ring-slate-100 sm:p-16">
            <div className="grid items-center gap-12 lg:grid-cols-2">
              <div>
                <h2 className="text-3xl font-extrabold tracking-tight text-[#004a87] sm:text-4xl">
                  Why Choose Eggcubator?
                </h2>
                <p className="mt-6 text-base leading-relaxed text-slate-600">
                  Built for efficiency, designed for scale. Eggcubator provides comprehensive 
                  monitoring solutions that grow with your business.
                </p>
                <ul className="mt-10 space-y-4">
                  {[
                    "Comprehensive batch tracking and management",
                    "Customizable dashboard for your workflow",
                    "Multi-device support with cloud sync",
                    "Detailed reporting and analytics",
                    "Secure authentication and data safety",
                    "24/7 system monitoring and alerts",
                  ].map((item, i) => (
                    <li key={i} className="flex items-center gap-3">
                      <CheckCircle2 className="h-5 w-5 text-orange-500" />
                      <span className="text-sm font-medium text-slate-700">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="relative">
                <div className="rounded-[2rem] bg-[#004a87] p-10 text-white shadow-2xl">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
                    <Cpu className="h-6 w-6" />
                  </div>
                  <h3 className="mt-8 text-3xl font-bold tracking-tight">Ready to Get Started?</h3>
                  <p className="mt-4 text-sm leading-relaxed text-sky-100/80">
                    Join our platform today and experience seamless incubator monitoring with 
                    powerful analytics and instant notifications.
                  </p>
                  <Link
                    href="/register"
                    className="mt-10 inline-flex h-12 w-full items-center justify-center rounded-xl bg-white px-6 text-sm font-bold text-[#004a87] transition hover:bg-sky-50 active:scale-95"
                  >
                    Create Your Account →
                  </Link>
                </div>
                {/* Decorative Pattern */}
                <div className="absolute -top-6 -right-6 -z-10 h-32 w-32 rounded-full bg-sky-100 blur-2xl" />
              </div>
            </div>
            {/* Grid Pattern Background overlay */}
            <div className="absolute inset-0 -z-10 opacity-[0.03] [mask-image:linear-gradient(white,transparent)]" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-100 bg-white py-12">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#004a87] p-1 shadow-sm">
                <Image
                  src="/eggcubator3.png"
                  alt="Logo"
                  width={20}
                  height={20}
                  className="h-full w-full object-contain brightness-0 invert"
                />
              </div>
              <span className="text-lg font-bold tracking-tight text-[#004a87] uppercase">
                Eggcubator
              </span>
            </div>
            <p className="text-sm text-slate-500">
              © {new Date().getFullYear()} Eggcubator. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
