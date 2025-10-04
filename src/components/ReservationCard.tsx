'use client';

interface ReservationCardProps {
  id: number;
  title: string;
  subtitle: string;
  price: number;
  reserved: boolean;
  onToggleReservation: (id: number) => void;
  isLoading?: boolean;
}

export default function ReservationCard({
  id,
  title,
  subtitle,
  price,
  reserved,
  onToggleReservation,
  isLoading = false
}: ReservationCardProps) {
  return (
    <div className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow duration-300 overflow-hidden">
      <div className="p-6">
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1">
            <h3 className="text-xl font-semibold text-gray-900 mb-2">{title}</h3>
            <p className="text-gray-600 mb-4">{subtitle}</p>
            <div className="text-2xl font-bold text-[#0BA6DF]">
              ${price}
            </div>
          </div>
          <div className={`px-3 py-1 rounded-full text-sm font-medium ${
            reserved 
              ? 'bg-[#EF7722] text-white' 
              : 'bg-[#EBEBEB] text-gray-700'
          }`}>
            {reserved ? 'Reserved' : 'Available'}
          </div>
        </div>
        
        <button
          onClick={() => onToggleReservation(id)}
          disabled={isLoading}
          className={`w-full py-3 px-4 rounded-lg font-medium transition-colors duration-200 ${
            reserved
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
            reserved ? 'Cancel Reservation' : 'Reserve Now'
          )}
        </button>
      </div>
    </div>
  );
}
