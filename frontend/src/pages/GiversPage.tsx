import { useState, useEffect } from 'react';
import { giversAPI } from '../utils/api';
import type { Giver, CreateGiverData } from '../utils/types';


const GiversPage = () => {
    const [givers, setGivers] = useState<Giver[]>([]);
    const [filteredGivers, setFilteredGivers] = useState<Giver[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    //Filter States
    const [searchTerm, setSearchTerm] = useState('');
    const [filterTitle, setFilterTitle] = useState<'all' | 'pastor' | 'member' | 'visitor'>('all');
    
    //Modal States
    const [showModal, setShowModal] = useState(false);
    const [editingGiver, setEditingGiver] = useState<Giver | null>(null);

    //Image Upload States
    const [selectedImage, setSelectedImage] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [isUpLoadingImage, setIsUpLoadingImage] = useState(false);



    //Form states
    const [formData, setFormData] = useState<CreateGiverData>({
        name: '',
        title: 'member',
        phone: '',
        email: '',
        address: '',
        notes: '',
        profile_picture: '',

    });


    //Loading givers on component mount
    useEffect(() => {
        loadGivers();
    }, []);

    //Filter givers when search or filter changes
    useEffect(() => {
        let result = givers;

        if (filterTitle !== 'all') {
            result = result.filter(giver => giver.title === filterTitle);
        }

        //Filter by search term
        if (searchTerm) {
            result = result.filter(giver => 
                giver.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                giver.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                giver.phone_number?.includes(searchTerm)
             );
        }

        setFilteredGivers(result);
    }, [givers, searchTerm, filterTitle]);
            
      
    const loadGivers = async () => {
        try {
            setIsLoading(true);
            const data = await giversAPI.getAll();
            setGivers(data);
            setError('');
        }
        catch (err: any) {
            setError('Failed to load givers');
            console.error(err);
        }
        finally {
            setIsLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        try {

            let savedGiver: Giver;

            if (editingGiver) {
                //update existing giver
                savedGiver = await giversAPI.update(editingGiver.id, { ...formData, id: editingGiver.id });
            } else {
                //create new giver
                savedGiver =await giversAPI.create(formData);
            }

            if(selectedImage && savedGiver.id) {
                try{
                    setIsUpLoadingImage(true);
                    await giversAPI.uploadedProfilePicture(savedGiver.id, selectedImage);
                }
                catch(uploadErr: any) {
                    console.error('Image Upload Error', uploadErr);
                    setError('Giver saved but failed to upload profile picture');
                }
                finally{
                    setIsUpLoadingImage(false);
                }
            }
            
            await loadGivers();
            closeModal();
        }
        catch (err: any) {
            console.error('Save error:', err);
            setError(err.response?.data?.error || 'Failed to save giver');
        }
        finally{
            setIsLoading(false);
            setIsUpLoadingImage(false);
        }
    };

    const handleDelete = async (id: number) => {
        if(!window.confirm(`Are you sure you want to delete this giver?`)) {
            return;
    }

    try {
        await giversAPI.delete(id);
        loadGivers(); //reload the givers list
    }
    catch (err: any) {
        setError(err.response?.data?.error || 'Failed to delete giver');
     }
    };

    const openAddModal = () => {
        setEditingGiver(null);
        setFormData({
            name: '',
            title: 'member',
            phone: '',
            email: '',
            address: '',
            notes: '',
        });
        setShowModal(true);
        setImagePreview(null);
        setSelectedImage(null);
    };

    const openEditModal = (giver: Giver) => {
        setEditingGiver(giver);
        setFormData({
            name: giver.name,
            title: giver.title,
            phone: giver.phone_number || '',
            email: giver.email || '',
            address: giver.address || '',
            notes: giver.notes || '',
        });
        setSelectedImage(null);
        setImagePreview(giver.profile_picture ? `http://localhost:5001/${giver.profile_picture}` : null);
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setEditingGiver(null);
        setError('');
        setSelectedImage(null);
        setImagePreview(null);
    };

    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {

            //validate first
            if(file){
                if(!file.type.startsWith('image/')) {
                    setError('Please select a valid image file');
                    return; 
                }

                //validate file size
                if(file.size > 5 * 1024 * 1024) {
                    setError('File size exceeds 5MB limit');
                    return;
                }

                setSelectedImage(file);

                //Creating preview
                const reader = new FileReader();
                reader.onloadend = () => {
                    setImagePreview(reader.result as string);
                };
                reader.readAsDataURL(file);
            }
        }
    };

    const handleRemoveImage = async () => {
        if(editingGiver && editingGiver.profile_picture) {
            //Deleting from server if editing existing giver with profile picture
            try{
                await giversAPI.deleteProfilePicture(editingGiver.id);
                setImagePreview(null);
                setSelectedImage(null);
                await loadGivers(); //reload givers to get updated profile picture info
            }
            catch (err: any) {
                setError('Failed to remove profile picture');
            }
        }
            else {
                setImagePreview(null);
                setSelectedImage(null);
            }
        };

    const getTitleBadgeColor = (title: string) => {
        switch (title) {
            case 'pastor': return 'bg-black-500 text-black-800 border-black-300';
            case 'member': return 'bg-[#D4AF37]/20 text-[#9B7506] border-2 border-[#D4AF37]';
            case 'visitor': return 'bg-green-100 text-blue-800 border-blue-300';
            default: return 'bg-gray-100 text-gray-800 border-2 border-gray-300';
        }
    };

    const getInitials = (name: string) => {
        return name
        .split(' ')
        .map(part => part[0])
        .join('')
        .toUpperCase()
        .slice(0 ,2);
    };

    const renderAvatar = (giver: Giver, size: 'small' | 'large' = 'small') => {
    const sizeClasses = size === 'small' ? 'w-10 h-10 text-sm' : 'w-24 h-24 text-2xl';
    
    if (giver.profile_picture) {
      return (
        <img
          src={`http://localhost:5001${giver.profile_picture}`}
          alt={giver.name}
          className={`${sizeClasses} rounded-full object-cover border-2 border-[#D4AF37]`}
        />
      );
    }

    return (
      <div className={`${sizeClasses} rounded-full bg-gradient-to-br from-[#D4AF37] to-[#B8860B] flex items-center justify-center text-white font-bold border-2 border-[#D4AF37]`}>
        {getInitials(giver.name)}
      </div>
    );
  };

  if (isLoading && givers.length === 0) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="text-2xl text-black font-bold" style={{ fontFamily: 'Newsreader, serif' }}>
          Loading Givers...
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-black mb-2" style={{ fontFamily: 'Newsreader, serif' }}>
            Givers Management
          </h1>
          <p className="text-black text-sm">Manage church members, pastors, and visitors</p>
        </div>

        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 text-red-800 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        {/* Search & Filter Bar */}
        <div className="bg-white/90 backdrop-blur-md p-6 rounded-xl shadow-lg border-2 border-[#D4AF37]/30 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Search by name, email, or phone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-[#D4AF37] focus:ring-[#D4AF37] text-black bg-white placeholder-gray-500"
              />
            </div>

            <div className="w-full md:w-48">
              <select
                value={filterTitle}
                onChange={(e) => setFilterTitle(e.target.value as any)}
                className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-[#D4AF37] focus:ring-[#D4AF37] text-black bg-white"
              >
                <option value="all">All Titles</option>
                <option value="pastor">Pastor</option>
                <option value="member">Member</option>
                <option value="visitor">Visitor</option>
              </select>
            </div>

            <button
              onClick={openAddModal}
              className="px-6 py-2 bg-gradient-to-r from-[#D4AF37] to-[#B8860B] hover:from-[#B8860B] hover:to-[#9B7506] text-white font-bold rounded-lg transition-all shadow-md hover:shadow-lg"
              style={{ fontFamily: 'Newsreader, serif' }}
            >
              + Add Giver
            </button>
          </div>
        </div>

        {/* Givers Table */}
        <div className="bg-white/90 backdrop-blur-md rounded-xl shadow-lg border-2 border-[#D4AF37]/30 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gradient-to-r from-[#D4AF37]/20 to-[#B8860B]/20">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold text-black uppercase tracking-wider" style={{ fontFamily: 'Newsreader, serif' }}>
                    Profile
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-black uppercase tracking-wider" style={{ fontFamily: 'Newsreader, serif' }}>
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-black uppercase tracking-wider" style={{ fontFamily: 'Newsreader, serif' }}>
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-black uppercase tracking-wider" style={{ fontFamily: 'Newsreader, serif' }}>
                    Phone
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-black uppercase tracking-wider" style={{ fontFamily: 'Newsreader, serif' }}>
                    Title
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-black uppercase tracking-wider" style={{ fontFamily: 'Newsreader, serif' }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredGivers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                      No givers found
                    </td>
                  </tr>
                ) : (
                  filteredGivers.map((giver) => (
                    <tr key={giver.id} className="hover:bg-[#D4AF37]/5 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        {renderAvatar(giver, 'small')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-black">
                        {giver.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {giver.email || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {giver.phone_number || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold capitalize ${getTitleBadgeColor(giver.title)}`}>
                          {giver.title}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                        <button
                          onClick={() => openEditModal(giver)}
                          className="text-blue-600 hover:text-blue-800 font-semibold"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(giver.id)}
                          className="text-red-600 hover:text-red-800 font-semibold"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 text-sm text-gray-600">
          Showing {filteredGivers.length} of {givers.length} givers
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border-2 border-[#D4AF37]">
            <div className="bg-gradient-to-r from-[#D4AF37] to-[#B8860B] p-6 rounded-t-2xl">
              <h2 className="text-2xl font-bold text-white" style={{ fontFamily: 'Newsreader, serif' }}>
                {editingGiver ? 'Edit Giver' : 'Add New Giver'}
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Profile Picture Upload */}
              <div className="flex flex-col items-center mb-6">
                <label className="block text-sm font-bold text-black mb-3" style={{ fontFamily: 'Newsreader, serif' }}>
                  Profile Picture
                </label>
                
                <div className="relative">
                  {imagePreview ? (
                    <div className="relative">
                      <img
                        src={imagePreview}
                        alt="Preview"
                        className="w-32 h-32 rounded-full object-cover border-4 border-[#D4AF37] shadow-lg"
                      />
                      <button
                        type="button"
                        onClick={handleRemoveImage}
                        className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-red-700 shadow-md"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div className="w-32 h-32 rounded-full bg-gradient-to-br from-[#D4AF37] to-[#B8860B] flex items-center justify-center text-white text-4xl font-bold border-4 border-[#D4AF37] shadow-lg">
                      {formData.name ? getInitials(formData.name) : '?'}
                    </div>
                  )}
                </div>

                <label className="mt-4 px-6 py-2 bg-gray-100 hover:bg-gray-200 text-black font-semibold rounded-lg cursor-pointer transition-colors border-2 border-gray-300">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageSelect}
                    className="hidden"
                  />
                  {imagePreview ? 'Change Picture' : 'Upload Picture'}
                </label>
                <p className="text-xs text-gray-500 mt-2">JPG, PNG, GIF (Max 5MB)</p>
              </div>

              <div>
                <label className="block text-sm font-bold text-black mb-1" style={{ fontFamily: 'Newsreader, serif' }}>
                  Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-[#D4AF37] focus:ring-[#D4AF37] text-black bg-white"
                  placeholder="Full name"
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-black mb-1" style={{ fontFamily: 'Newsreader, serif' }}>
                    Email
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-[#D4AF37] focus:ring-[#D4AF37] text-black bg-white"
                    placeholder="email@example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-black mb-1" style={{ fontFamily: 'Newsreader, serif' }}>
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-[#D4AF37] focus:ring-[#D4AF37] text-black bg-white"
                    placeholder="(123) 456-7890"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-black mb-1" style={{ fontFamily: 'Newsreader, serif' }}>
                  Address
                </label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-[#D4AF37] focus:ring-[#D4AF37] text-black bg-white"
                  placeholder="Street address"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-black mb-1" style={{ fontFamily: 'Newsreader, serif' }}>
                  Title *
                </label>
                <select
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value as any })}
                  className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-[#D4AF37] focus:ring-[#D4AF37] text-black bg-white"
                  required
                >
                  <option value="member">Member</option>
                  <option value="pastor">Pastor</option>
                  <option value="visitor">Visitor</option>
                </select>
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="submit"
                  disabled={isLoading || isUpLoadingImage}
                  className="flex-1 bg-gradient-to-r from-[#D4AF37] to-[#B8860B] hover:from-[#B8860B] hover:to-[#9B7506] text-white font-bold py-3 rounded-lg transition-all shadow-md hover:shadow-lg disabled:opacity-50"
                  style={{ fontFamily: 'Newsreader, serif' }}
                >
                  {isLoading || isUpLoadingImage ? 'Saving...' : editingGiver ? 'Update Giver' : 'Add Giver'}
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 bg-gray-200 hover:bg-gray-300 text-black font-bold py-3 rounded-lg transition-colors"
                  style={{ fontFamily: 'Newsreader, serif' }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default GiversPage;