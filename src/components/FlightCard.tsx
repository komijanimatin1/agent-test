'use client';

import { Flight } from '@/lib/api';

interface FlightCardProps {
  flight: Flight;
  onToggleReservation: (id: string) => void;
  isLoading?: boolean;
}

export default function FlightCard({
  flight,
  onToggleReservation,
  isLoading = false
}: FlightCardProps) {
  return (
    <div className="bg-white rounded-lg shadow-md hover:shadow-xl transition-shadow duration-300 overflow-hidden">
      <div className="p-6">
        {/* Header with status */}
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-1 rounded">
                {flight.continent}
              </span>
              <span className="text-xs font-semibold text-[#0BA6DF] bg-blue-50 px-2 py-1 rounded">
                {flight.flight_number}
              </span>
            </div>
          </div>
          <div className={`px-3 py-1 rounded-full text-sm font-medium ${
            flight.reserved 
              ? 'bg-[#EF7722] text-white' 
              : 'bg-[#EBEBEB] text-gray-700'
          }`}>
            {flight.reserved ? 'Reserved' : 'Available'}
          </div>
        </div>

        {/* Flight route */}
        <div className="mb-4">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="text-2xl font-bold text-gray-900">{flight.from}</div>
              <div className="text-xs text-gray-500 mt-1">{flight.from_airport}</div>
            </div>
            <div className="flex-shrink-0 mx-4">
              <svg className="w-8 h-8 text-[#0BA6DF]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </div>
            <div className="flex-1 text-right">
              <div className="text-2xl font-bold text-gray-900">{flight.to}</div>
              <div className="text-xs text-gray-500 mt-1">{flight.to_airport}</div>
            </div>
          </div>
        </div>

        {/* Airline info */}
        <div className="mb-4 pb-4 border-b border-gray-200">
          <div className="flex items-center justify-center">
            <svg className="w-5 h-5 text-gray-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
            </svg>
            <span className="text-sm font-medium text-gray-700">{flight.airline}</span>
          </div>
        </div>

        {/* Flight details */}
        <div className="mb-4 space-y-2 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Date:</span>
            <span className="font-medium text-gray-900">{flight.date}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Departure:</span>
            <span className="font-medium text-gray-900">{flight.departure_time}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Arrival:</span>
            <span className="font-medium text-gray-900">{flight.arrival_time}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Duration:</span>
            <span className="font-medium text-[#0BA6DF]">{flight.duration}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Seats Available:</span>
            <span className={`font-medium ${flight.seats_remaining < 10 ? 'text-red-600' : 'text-green-600'}`}>
              {flight.seats_remaining}
            </span>
          </div>
        </div>

        {/* Baggage info */}
        <div className="mb-4 bg-gray-50 rounded-lg p-3">
          <div className="text-xs font-semibold text-gray-700 mb-2">Baggage Allowance</div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-gray-600">Carry-on:</span>
              <span className="ml-1 font-medium text-gray-900">{flight.baggage.carry_on}</span>
            </div>
            <div>
              <span className="text-gray-600">Checked:</span>
              <span className="ml-1 font-medium text-gray-900">{flight.baggage.checked}</span>
            </div>
          </div>
        </div>

        {/* Pricing */}
        <div className="mb-4 bg-gradient-to-r from-[#0BA6DF]/10 to-[#FAA533]/10 rounded-lg p-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-gray-600 mb-1">Economy</div>
              <div className="text-xl font-bold text-[#0BA6DF]">
                ${flight.price.economy}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-600 mb-1">Business</div>
              <div className="text-xl font-bold text-[#FAA533]">
                ${flight.price.business}
              </div>
            </div>
          </div>
        </div>

        {/* Action button */}
        <button
          onClick={() => onToggleReservation(flight.id)}
          disabled={isLoading}
          className={`w-full py-3 px-4 rounded-lg font-medium transition-colors duration-200 ${
            flight.reserved
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
            flight.reserved ? 'Cancel Reservation' : 'Reserve Now'
          )}
        </button>
      </div>
    </div>
  );
}

