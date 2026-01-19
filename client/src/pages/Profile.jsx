import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { api } from '../api';

function Profile() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [profileImageUrl, setProfileImageUrl] = useState(null);
  
  // Form state
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('Parent');

  // Load profile on mount
  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      setLoading(true);
      
      let data;
      try {
        data = await api.getProfile();
      } catch (err) {
        // Profile doesn't exist yet, bootstrap it
        console.log('Profile not found, bootstrapping...');
        data = await api.bootstrap();
      }
      
      setProfile(data);
      setDisplayName(data.displayName || '');
      setPhone(data.phone || '');
      setRole(data.role || 'Parent');
      
      // Load profile image if exists
      if (data.profileImageKey) {
        loadProfileImage();
      }
    } catch (err) {
      console.error('Failed to load profile:', err);
      setError('Failed to load profile. Please try refreshing.');
    } finally {
      setLoading(false);
    }
  };

  const loadProfileImage = async () => {
    try {
      const { imageUrl } = await api.getImageUrl();
      setProfileImageUrl(imageUrl);
    } catch (err) {
      // Image probably doesn't exist yet - this is fine
      console.log('No profile image yet');
      setProfileImageUrl(null);
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const updated = await api.updateProfile({
        displayName,
        phone,
        role,
      });
      setProfile(updated);
      setSuccess('Profile updated successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      console.error('Failed to update profile:', err);
      setError(err.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be less than 5MB');
      return;
    }

    setUploading(true);
    setError('');

    try {
      // Step 1: Get pre-signed upload URL
      const { uploadUrl, objectKey } = await api.initImageUpload();

      // Step 2: Upload image directly to S3
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload image to S3');
      }

      // Step 3: Complete upload (save key to DynamoDB)
      await api.completeImageUpload(objectKey);

      // Step 4: Reload profile image
      await loadProfileImage();
      setSuccess('Profile image updated!');
      setTimeout(() => setSuccess(''), 3000);
      
    } catch (err) {
      console.error('Image upload failed:', err);
      setError(err.message || 'Failed to upload image');
    } finally {
      setUploading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      navigate('/login');
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading profile...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Header with Navigation */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-white">Profile</h1>
          <div className="flex gap-4">
            <button
              onClick={() => navigate('/dashboard')}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              View Dashboard
            </button>
            <button
              onClick={handleSignOut}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Success Message */}
        {success && (
          <div className="bg-green-500/10 border border-green-500 text-green-500 px-4 py-3 rounded-lg mb-6">
            {success}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-500/10 border border-red-500 text-red-500 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-6">
          {/* Profile Image Section */}
          <div className="bg-gray-800 rounded-lg shadow-2xl p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Profile Picture</h2>
            
            <div className="flex flex-col items-center">
              {/* Image Preview */}
              <div className="w-40 h-40 rounded-full bg-gray-700 flex items-center justify-center overflow-hidden mb-4">
                {profileImageUrl ? (
                  <img
                    src={profileImageUrl}
                    alt="Profile"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-6xl text-gray-500">
                    {displayName?.[0]?.toUpperCase() || '?'}
                  </span>
                )}
              </div>

              {/* Upload Button */}
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  disabled={uploading}
                  className="hidden"
                />
                <div className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-lg transition-colors text-center">
                  {uploading ? 'Uploading...' : 'Upload Image'}
                </div>
              </label>

              <p className="text-gray-400 text-sm mt-2 text-center">
                JPG, PNG or GIF (max 5MB)
              </p>
            </div>
          </div>

          {/* Profile Form Section */}
          <div className="md:col-span-2 bg-gray-800 rounded-lg shadow-2xl p-6">
            <h2 className="text-xl font-semibold text-white mb-6">Account Information</h2>

            <form onSubmit={handleSaveProfile} className="space-y-6">
              {/* Email (Read-only) */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={profile?.email || ''}
                  disabled
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-gray-400 cursor-not-allowed"
                />
                <p className="text-gray-500 text-xs mt-1">Email cannot be changed</p>
              </div>

              {/* Display Name */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Display Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="Your name"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="(555) 123-4567"
                />
              </div>

              {/* Role */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Role
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="Parent">Parent</option>
                  <option value="Educator">Educator</option>
                  <option value="Admin">Admin</option>
                </select>
              </div>

              {/* Save Button */}
              <button
                type="submit"
                disabled={saving}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-semibold py-3 rounded-lg transition-colors"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </form>

            {/* Account Info */}
            <div className="mt-6 pt-6 border-t border-gray-700">
              <div className="text-sm text-gray-400 space-y-1">
                <p>Account created: {new Date(profile?.createdAt).toLocaleDateString()}</p>
                <p>Last updated: {new Date(profile?.updatedAt).toLocaleDateString()}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Profile;