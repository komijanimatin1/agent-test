'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { tourApi, Tour } from '@/lib/api';
import ReservationCard from '@/components/ReservationCard';

export default function ToursPage() {
  const [loadingStates, setLoadingStates] = useState<Record<number, boolean>>({});
  
  // Fetch tours data using SWR
  const { data: tours, error, mutate } = useSWR<Tour[]>('tours', tourApi.getAll, {
    refreshInterval: 5000, // Refresh every 5 seconds
  });

  const handleToggleReservation = async (id: number) => {
    setLoadingStates(prev => ({ ...prev, [id]: true }));
    
    try {
      // Optimistic update
      const updatedTours = tours?.map(tour => 
        tour.id === id ? { ...tour, reserved: !tour.reserved } : tour
      );
      mutate(updatedTours, false);
      
      // Make the actual API call
      await tourApi.toggleReservation(id);
      
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
            <h1 className="text-2xl font-bold text-red-600 mb-4">Error Loading Tours</h1>
            <p className="text-gray-600">Please make sure JSON Server is running on port 3001</p>
          </div>
        </div>
      </div>
    );
  }

  if (!tours) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0BA6DF] mx-auto mb-4"></div>
            <p className="text-gray-600">Loading tours...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Tours</h1>
          <p className="text-gray-600">Discover amazing destinations with guided tours</p>
        </div>


        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tours.map((tour) => (
            <ReservationCard
              key={tour.id}
              id={tour.id}
              title={tour.destination}
              subtitle={`Duration: ${tour.duration}`}
              price={tour.price}
              reserved={tour.reserved}
              onToggleReservation={handleToggleReservation}
              isLoading={loadingStates[tour.id] || false}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
