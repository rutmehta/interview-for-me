import { User } from "@supabase/supabase-js"
import { supabase } from "../lib/supabase"

interface UserProfileProps {
  user: User
}

export default function UserProfile({ user }: UserProfileProps) {
  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <div className="flex items-center justify-between p-4 bg-white border-b">
      <div className="flex items-center space-x-4">
        {user.user_metadata.avatar_url && (
          <img
            src={user.user_metadata.avatar_url}
            alt="Profile"
            className="w-8 h-8 rounded-full"
          />
        )}
        <span className="text-sm font-medium text-gray-700">
          {user.user_metadata.full_name || user.email}
        </span>
      </div>
      <button
        onClick={handleSignOut}
        className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
      >
        Sign Out
      </button>
    </div>
  )
}
