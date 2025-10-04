'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { hotelApi, Hotel } from '@/lib/api';
import ReservationCard from '@/components/ReservationCard';

export default function HotelsPage() {
  const [loadingStates, setLoadingStates] = useState<Record<number, boolean>>({});
  
  // Fetch hotels data using SWR
  const { data: hotels, error, mutate } = useSWR<Hotel[]>('hotels', hotelApi.getAll, {
    refreshInterval: 5000, // Refresh every 5 seconds
  });

  const handleToggleReservation = async (id: number) => {
    setLoadingStates(prev => ({ ...prev, [id]: true }));
    
    try {
      // Optimistic update
      const updatedHotels = hotels?.map(hotel => 
        hotel.id === id ? { ...hotel, reserved: !hotel.reserved } : hotel
      );
      mutate(updatedHotels, false);
      
      // Make the actual API call
      await hotelApi.toggleReservation(id);
      
      // Revalidate the data
      mutate();
    } catch (error) {
      console.error('Failed to toggle reservation:', error);
      // Revert optimistic update on error
      mutate();
    } finally {
      setLoadingStates(prev => ({ ...prev, [id]: false }));
    }
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-red-600 mb-4">Error Loading Hotels</h1>
            <p className="text-gray-600">Please make sure JSON Server is running on port 3001</p>
          </div>
        </div>
      </div>
    );
  }

  if (!hotels) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0BA6DF] mx-auto mb-4"></div>
            <p className="text-gray-600">Loading hotels...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Hotels</h1>
          <p className="text-gray-600">Find and reserve your perfect hotel stay</p>
        </div>


        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {hotels.map((hotel) => (
            <ReservationCard
              key={hotel.id}
              id={hotel.id}
              title={hotel.name}
              subtitle={hotel.location}
              price={hotel.price}
              reserved={hotel.reserved}
              onToggleReservation={handleToggleReservation}
              isLoading={loadingStates[hotel.id] || false}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
