'use client';

import { Hotel } from '@/lib/api';

interface HotelCardProps {
  hotel: Hotel;
  onToggleReservation: (id: string) => void;
  isLoading?: boolean;
}

export default function HotelCard({
  hotel,
  onToggleReservation,
  isLoading = false
}: HotelCardProps) {
  return (
    <div className="bg-white rounded-lg shadow-md hover:shadow-xl transition-shadow duration-300 overflow-hidden">
      <div className="p-6">
        {/* Header with title and status */}
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1">
            <h3 className="text-xl font-bold text-gray-900 mb-1">{hotel.name}</h3>
            <p className="text-gray-600 flex items-center">
              <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
              </svg>
              {hotel.location}
            </p>
          </div>
          <div className={`px-3 py-1 rounded-full text-sm font-medium ${
            hotel.reserved 
              ? 'bg-[#EF7722] text-white' 
              : 'bg-[#EBEBEB] text-gray-700'
          }`}>
            {hotel.reserved ? 'Reserved' : 'Available'}
          </div>
        </div>

        {/* Stars rating */}
        <div className="flex items-center mb-4">
          {[...Array(5)].map((_, i) => (
            <svg
              key={i}
              className={`w-5 h-5 ${i < hotel.stars ? 'text-yellow-400' : 'text-gray-300'}`}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          ))}
          <span className="ml-2 text-sm text-gray-600">{hotel.stars} Stars</span>
        </div>

        {/* Amenities */}
        <div className="mb-4 flex flex-wrap gap-2">
          {hotel.has_wifi && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800">
              <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M17.778 8.222c-4.296-4.296-11.26-4.296-15.556 0A1 1 0 01.808 6.808c5.076-5.077 13.308-5.077 18.384 0a1 1 0 01-1.414 1.414zM14.95 11.05a7 7 0 00-9.9 0 1 1 0 01-1.414-1.414 9 9 0 0112.728 0 1 1 0 01-1.414 1.414zM12.12 13.88a3 3 0 00-4.242 0 1 1 0 01-1.415-1.415 5 5 0 017.072 0 1 1 0 01-1.415 1.415zM9 16a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z" clipRule="evenodd" />
              </svg>
              WiFi
            </span>
          )}
          {hotel.has_pool && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-cyan-100 text-cyan-800">
              <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 6a2 2 0 012-2h12a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
              </svg>
              Pool
            </span>
          )}
          {hotel.has_gym && (
            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-green-100 text-green-800">
              <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
              </svg>
              Gym
            </span>
          )}
        </div>

        {/* Room details */}
        <div className="mb-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Room Type:</span>
            <span className="font-medium text-gray-900">{hotel.room_type}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Available Rooms:</span>
            <span className="font-medium text-gray-900">{hotel.available_rooms}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Check-in:</span>
            <span className="font-medium text-gray-900">{hotel.check_in}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Check-out:</span>
            <span className="font-medium text-gray-900">{hotel.check_out}</span>
          </div>
        </div>

        {/* Price */}
        <div className="mb-4 bg-gradient-to-r from-[#0BA6DF]/10 to-[#FAA533]/10 rounded-lg p-3">
          <div className="flex justify-between items-center">
            <span className="text-gray-600 text-sm">Price per night</span>
            <div className="text-2xl font-bold text-[#0BA6DF]">
              ${hotel.price_per_night}
            </div>
          </div>
        </div>

        {/* Action button */}
        <button
          onClick={() => onToggleReservation(hotel.id)}
          disabled={isLoading}
          className={`w-full py-3 px-4 rounded-lg font-medium transition-colors duration-200 ${
            hotel.reserved
              ? 'bg-red-500 hover:bg-red-600 text-white'
              : 'bg-[#FAA533] hover:bg-[#EF7722] text-white'
          } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {isLoading ? (
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              Processing...
            </div>
          ) : (
            hotel.reserved ? 'Cancel Reservation' : 'Reserve Now'
          )}
        </button>
      </div>
    </div>
  );
}

