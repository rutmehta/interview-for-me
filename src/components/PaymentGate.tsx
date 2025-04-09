import { User } from "@supabase/supabase-js"
import { supabase } from "../lib/supabase"
import { IoLogOutOutline } from "react-icons/io5"

interface PaymentGateProps {
  user: User
}

export default function PaymentGate(_props: PaymentGateProps) {
  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <div className="flex w-fit items-center justify-center bg-black/80 rounded-xl p-8">
      <div className="relative flex flex-col items-center justify-center space-y-6">
        <button
          onClick={handleSignOut}
          className="absolute -top-2 -right-2 text-red-500/70 hover:text-red-500/90 hover:cursor-pointer transition-colors"
          title="Sign Out"
        >
          <IoLogOutOutline className="w-5 h-5" />
        </button>

        <div className="text-center">
          <h2 className="mb-3 bg-gradient-to-r from-white to-white/80 bg-clip-text text-2xl font-semibold text-transparent">
            One Last Step
          </h2>
          <p className="text-base text-gray-400">
            Please send $50 to @churlee12 on Venmo to continue. Add the gmail
            account you'll be using for this service in the message
          </p>
        </div>

        <a
          href="https://venmo.com/churlee12"
          target="_blank"
          rel="noopener noreferrer"
          className="group relative flex w-full items-center justify-center gap-3 rounded-lg border border-[#008CFF]/20 bg-[#008CFF]/5 px-6 py-3.5 transition-all duration-200 hover:bg-[#008CFF]/10"
        >
          <svg className="h-5 w-5 text-[#008CFF]" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M19.5 3h-15A1.5 1.5 0 003 4.5v15A1.5 1.5 0 004.5 21h15a1.5 1.5 0 001.5-1.5v-15A1.5 1.5 0 0019.5 3zm-7.1 13.5c-.8 0-1.5-.3-2-1l-2.1-3.3c-.2-.3-.2-.7 0-1l2.1-3.3c.5-.7 1.2-1 2-1s1.5.3 2 1l2.1 3.3c.2.3.2.7 0 1l-2.1 3.3c-.5.7-1.2 1-2 1z"
            />
          </svg>
          <span className="text-sm font-medium text-[#008CFF]">
            Pay with Venmo
          </span>
          <div className="absolute inset-0 rounded-lg border border-[#008CFF]/0 transition-all duration-200 group-hover:border-[#008CFF]/20" />
        </a>

        <p className="text-xs text-gray-500">
          Your email will be manually verified no later than 24 hours after
          payment
        </p>
      </div>
    </div>
  )
}
