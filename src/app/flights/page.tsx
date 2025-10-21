'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { flightApi, Flight } from '@/lib/api';
import FlightCard from '@/components/FlightCard';

export default function FlightsPage() {
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});
  
  // Fetch flights data using SWR
  const { data: flights, error, mutate } = useSWR<Flight[]>('flights', flightApi.getAll, {
    refreshInterval: 5000, // Refresh every 5 seconds
  });

  const handleToggleReservation = async (id: string) => {
    setLoadingStates(prev => ({ ...prev, [id]: true }));
    
    try {
      // Optimistic update
      const updatedFlights = flights?.map(flight => 
        flight.id === id ? { ...flight, reserved: !flight.reserved } : flight
      );
      mutate(updatedFlights, false);
      
      // Make the actual API call
      await flightApi.toggleReservation(id);
      
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
            <h1 className="text-2xl font-bold text-red-600 mb-4">Error Loading Flights</h1>
            <p className="text-gray-600">Please make sure JSON Server is running on port 3001</p>
          </div>
        </div>
      </div>
    );
  }

  if (!flights) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0BA6DF] mx-auto mb-4"></div>
            <p className="text-gray-600">Loading flights...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Flights</h1>
          <p className="text-gray-600">Book your next flight adventure</p>
        </div>


        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {flights.map((flight) => (
            <FlightCard
              key={flight.id}
              flight={flight}
              onToggleReservation={handleToggleReservation}
              isLoading={loadingStates[flight.id] || false}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
