import { useEffect, useState } from 'react';
import { offeringsAPI, giversAPI } from '../utils/api';
import type { Offering, CreateOfferingData, Giver } from '../utils/types';


const OfferingsPage = () => {
    const [offerings, setOfferings] = useState<Offering[]>([]);
    const [givers, setGivers] = useState<Giver[]>([]);
    const [filteredOfferings, setFilteredOfferings] = useState<Offering[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    //Filters
    const [filterGiverId, setFilterGiverId] = useState<string>('all');
    const [filterMethod, setFilterMethod] = useState<string>('all');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    //Time Format
    const formatDate = (dateString: string): string => {
      const date = new Date(dateString);
      return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
    };

    //Modal state
    const [showModal, setShowModal] = useState(false);
    const [editingOffering, setEditingOffering] = useState<Offering | null>(null);

    //Form state
    const [formData, setFormData] = useState<CreateOfferingData>({
        giver_id: 0,
        amount: 0,
        date: new Date().toISOString().split('T')[0],//The date for today
        method: 'cash',
        category: 'general',
        check_number: '',
        notes: '',
    });

    //Load Offerings & givers on mount
    useEffect(() => {
        loadData();
    }, []);

    //Applying filters when data or filters change
    useEffect(() => {
        applyFilters();
    }, [offerings, filterGiverId, filterMethod, startDate ,endDate]);

    const loadData = async () => {
        try {
            setIsLoading(true);
            const [offeringsData, giversData] = await Promise.all([
                offeringsAPI.getAll(),
                giversAPI.getAll(),
            ]);

            setOfferings(offeringsData);
            setGivers(giversData);
            setError('');
        } 
        catch (err: any) {
            setError('Failed to load data');
            console.error(err);
        }
        finally {
            setIsLoading(false);
        }
    };


    const applyFilters = () => {
        let result = offerings;

        //Filter by giver
        if(filterGiverId !== 'all')
        {
            result = result.filter(offering => offering.giver_id === parseInt(filterGiverId));
        }

        //Filter by method
        if(filterMethod !== 'all')
        {
            result = result.filter(offering => offering.method === filterMethod);
        }

        //Filter by date range
        if(startDate) {
            result = result.filter(offering => offering.date >= startDate);
        }

        if(endDate) {
            result = result.filter(offering => offering.date <= endDate);
        }

        setFilteredOfferings(result);
    };

    const handleSubmit = async (e:  React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        try{
            if(editingOffering){
                await offeringsAPI.update(editingOffering.id, { ...formData, id: editingOffering.id });
            }
            else
            {
                await offeringsAPI.create(formData);
            }

            loadData();
            closeModal();
        }
        catch (err: any)
        {
            setError(err.response?.data?.error || 'Failed to save offering');
        }
    };

    const handleDelete = async (id: number, amount: number) => {
        if(!window.confirm(`Are you sure you want to delete this $${amount} offering?`)) {
            return;
        }

        try {
            await offeringsAPI.delete(id);
            loadData();
        }
        catch (err: any)
        {
            setError('Failed to delete offering');
        }
    };

    const openAddModal = () => {
        setEditingOffering(null);
        
        setFormData({
            giver_id: givers.length > 0 ? givers[0].id : 0,
            amount: 0,
            date: new Date().toISOString().split('T')[0],
            method: 'cash',
            category: 'general',
            check_number: '',
            notes: '',
        });

        setShowModal(true);
    };

    const openEditModal = (offering: Offering) => {
        setEditingOffering(offering);

        let formattedDate = offering.date;
        if(offering.date.includes('T'))
        {
          formattedDate = offering.date.split('T')[0];
        }
        
        setFormData({
            giver_id: offering.giver_id,
            amount: offering.amount,
            date: formattedDate,
            method: offering.method,
            category: offering.category || 'general',
            check_number: offering.check_number || '',
            notes: offering.notes || '',
        });

        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setEditingOffering(null);
        setError('');
    };

    const getGiverName = (giverId: number): string => {
        const giver = givers.find(g => g.id === giverId);
        return giver ? giver.name : 'Unknown';
    };

    const getMethodBadgeColor = (method: string) => {
        switch(method) {
             case 'cash': return 'bg-green-100 text-green-800 border-green-300';
             case 'check': return 'bg-blue-100 text-blue-800 border-blue-300';
             case '': return 'bg-purple-100 text-purple-800 border-purple-300';
             case 'transfer': return 'bg-orange-100 text-orange-800 border-orange-300';
             default: return 'bg-gray-100 text-gray-800 border-gray-300';
        }
    };

    const getTotalAmount = (): number => {
        return filteredOfferings.reduce((sum, offering) => sum + parseFloat(String(offering.amount)), 0);
    };

    if (isLoading) {
        return(
             <div className="min-h-screen bg-celestial flex items-center justify-center">
        <div className="text-2xl text-black font-bold" style={{ fontFamily: 'Newsreader, serif' }}>
          Loading...
        </div>
      </div>
    );
  }

    return (
    <div className="min-h-screen bg-celestial p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-black mb-2" style={{ fontFamily: 'Newsreader, serif' }}>
            Offerings Portal
          </h1>
          <p className="text-black text-sm">Track and manage church offerings</p>
        </div>

        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 text-red-800 px-4 py-3 mb-6">
            {error}
          </div>
        )}

        {/* Stats Card */}
        <div className="bg-white/90 backdrop-blur-md p-6 shadow-lg border-2 border-[#D4AF37]/30 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <p className="text-sm text-gray-600 font-semibold">Total Offerings</p>
              <p className="text-3xl font-bold text-black" style={{ fontFamily: 'Newsreader, serif' }}>
                {filteredOfferings.length}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 font-semibold">Total Amount</p>
              <p className="text-3xl font-bold text-green-600" style={{ fontFamily: 'Newsreader, serif' }}>
                ${getTotalAmount().toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 font-semibold">Average Offering</p>
              <p className="text-3xl font-bold text-blue-600" style={{ fontFamily: 'Newsreader, serif' }}>
                ${filteredOfferings.length > 0 ? (getTotalAmount() / filteredOfferings.length).toFixed(2) : '0.00'}
              </p>
            </div>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="bg-white/90 backdrop-blur-md p-6 shadow-lg border-2 border-[#D4AF37]/30 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {/* Giver Filter */}
            <div>
              <label className="block text-sm font-bold text-black mb-2">Giver</label>
              <select
                value={filterGiverId}
                onChange={(e) => setFilterGiverId(e.target.value)}
                className="w-full px-4 py-2 border-2 border-gray-300 focus:border-[#D4AF37] text-black bg-white"
              >
                <option value="all">All Givers</option>
                {givers.map(giver => (
                  <option key={giver.id} value={giver.id}>{giver.name}</option>
                ))}
              </select>
            </div>

            {/* Method Filter */}
            <div>
              <label className="block text-sm font-bold text-black mb-2">Method</label>
              <select
                value={filterMethod}
                onChange={(e) => setFilterMethod(e.target.value)}
                className="w-full px-4 py-2 border-2 border-gray-300 focus:border-[#D4AF37] text-black bg-white"
              >
                <option value="all">All Methods</option>
                <option value="cash">Cash</option>
                <option value="check">Check</option>
                <option value="card">Zelle</option>
                <option value="transfer">Transfer</option>
                <option value="other">Other</option>
              </select>
            </div>

            {/* Start Date */}
            <div>
              <label className="block text-sm font-bold text-black mb-2">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-4 py-2 border-2 border-gray-300 focus:border-[#D4AF37] text-black bg-white"
              />
            </div>

            {/* End Date */}
            <div>
              <label className="block text-sm font-bold text-black mb-2">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-4 py-2 border-2 border-gray-300 focus:border-[#D4AF37] text-black bg-white"
              />
            </div>

            {/* Add Button */}
            <div className="flex items-end">
              <button
                onClick={openAddModal}
                className="w-full px-6 py-2 bg-gradient-to-r from-[#D4AF37] to-[#B8860B] text-white font-bold hover:bg-gray-800 transition-colors"
              >
                + Add Offering
              </button>
            </div>
          </div>
        </div>

        {/* Offerings Table */}
        <div className="bg-white/90 backdrop-blur-md shadow-lg border-2 border-[#D4AF37]/30 overflow-hidden">
          {filteredOfferings.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-600 text-lg">No offerings found</p>
              <button
                onClick={openAddModal}
                className="mt-4 px-6 py-2 bg-gradient-to-r from-[#D4AF37] to-[#B8860B] text-white font-bold hover:bg-gray-800"
              >
                Add Your First Offering
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-100 border-b-2 border-gray-300">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-bold text-black" style={{ fontFamily: 'Newsreader, serif' }}>
                      Date
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-bold text-black" style={{ fontFamily: 'Newsreader, serif' }}>
                      Giver
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-bold text-black" style={{ fontFamily: 'Newsreader, serif' }}>
                      Amount
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-bold text-black" style={{ fontFamily: 'Newsreader, serif' }}>
                      Method
                    </th>
                    <th className="px-6 py-4 text-left text-sm font-bold text-black" style={{ fontFamily: 'Newsreader, serif' }}>
                      Category
                    </th>
                    <th className="px-6 py-4 text-right text-sm font-bold text-black" style={{ fontFamily: 'Newsreader, serif' }}>
                      Actions
                    </th>
                  </tr>
                </thead>

                {/* Table Information (Rows) */}
                <tbody className="divide-y divide-gray-200">
                  {filteredOfferings.map((offering) => (
                    <tr key={offering.id} className="hover:bg-gray-50/50 transition-colors">
                      
                       {/* Offering Date */}
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-700">{formatDate(offering.date)}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-semibold text-black">{getGiverName(offering.giver_id)}</div>
                      </td>
                     
                      <td className="px-6 py-4">
                        <div className="text-lg font-bold text-green-600">${parseFloat(String(offering.amount)).toFixed(2)}</div>
                      </td>
                     
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getMethodBadgeColor(offering.method)}`}>
                          {offering.method.charAt(0).toUpperCase() + offering.method.slice(1)}
                        </span>
                      </td>
                      
                      {/* Category */}
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 capitalize">
                        <span className="max-w-[150px] inline-block truncate" title={offering.category.replace('_', ' ')}>
                          {offering.category.replace('_', ' ')}
                        </span>
                      </td>
            
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => openEditModal(offering)}
                          className="text-blue-600 hover:text-blue-800 font-semibold mr-4"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(offering.id, offering.amount)}
                          className="text-red-600 hover:text-red-800 font-semibold"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="mt-6 text-center text-sm text-black">
          Showing {filteredOfferings.length} of {offerings.length} offerings
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-8">
              <h2 className="text-3xl font-bold text-black mb-6" style={{ fontFamily: 'Newsreader, serif' }}>
                {editingOffering ? 'Edit Offering' : 'Add New Offering'}
              </h2>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  
                  {/* Giver Selection */}
                  <div>
                    <label className="block text-sm font-bold text-black mb-2">Giver *</label>
                    <select
                      value={formData.giver_id}
                      onChange={(e) => setFormData({ ...formData, giver_id: parseInt(e.target.value) })}
                      className="w-full px-4 py-2 border-2 border-gray-300 focus:border-[#D4AF37] text-black bg-white"
                      required
                    >
                      <option value={0}>Select a giver...</option>
                      {givers.map(giver => (
                        <option key={giver.id} value={giver.id}>{giver.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Amount */}
                  <div>
                    <label className="block text-sm font-bold text-black mb-2">Amount *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={formData.amount || ''}
                      onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                      className="w-full px-4 py-2 border-2 border-gray-300 focus:border-[#D4AF37] text-black bg-white"
                      placeholder="0.00"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Date */}
                  <div>
                    <label className="block text-sm font-bold text-black mb-2">Date *</label>
                    <input
                      type="date"
                      value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                      className="w-full px-4 py-2 border-2 border-gray-300 focus:border-[#D4AF37] text-black bg-white"
                      required
                    />
                  </div>

                  {/* Method */}
                  <div>
                    <label className="block text-sm font-bold text-black mb-2">Method *</label>
                    <select
                      value={formData.method}
                      onChange={(e) => setFormData({ ...formData, method: e.target.value as any })}
                      className="w-full px-4 py-2 border-2 border-gray-300 ocus:border-[#D4AF37] text-black bg-white"
                      required
                    >
                      <option value="cash">Cash</option>
                      <option value="check">Check</option>
                      <option value="card">Zelle</option>
                      <option value="transfer">Transfer</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Category */}
                  <div>
                    <label className="block text-sm font-bold text-black mb-2">Category</label>
                    <input
                      type="text"
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className="w-full px-4 py-2 border-2 border-gray-300 focus:border-[#D4AF37] text-black bg-white"
                      placeholder="general, missions, building, etc."
                    />
                  </div>

                  {/* Check Number (conditional) */}
                  {formData.method === 'check' && (
                    <div>
                      <label className="block text-sm font-bold text-black mb-2">Check Number</label>
                      <input
                        type="text"
                        value={formData.check_number}
                        onChange={(e) => setFormData({ ...formData, check_number: e.target.value })}
                        className="w-full px-4 py-2 border-2 border-gray-300 focus:border-[#D4AF37] text-black bg-white"
                        placeholder="1234"
                      />
                    </div>
                  )}
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-bold text-black mb-2">Notes</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="w-full px-4 py-2 border-2 border-gray-300 focus:border-[#D4AF37] text-black bg-white"
                    rows={3}
                    placeholder="Additional notes..."
                  />
                </div>

                <div className="flex gap-4 pt-4">
                  <button
                    type="submit"
                    className="flex-1 bg-gradient-to-r from-[#D4AF37] to-[#B8860B] text-white font-bold py-3 hover:bg-gray-800 transition-colors"
                  >
                    {editingOffering ? 'Update Offering' : 'Add Offering'}
                  </button>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="flex-1 bg-gradient-to-r from-black to-gray-800 hover:from-gray-800 hover:to-black text-white font-bold py-3 px-6 text-center transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OfferingsPage;

