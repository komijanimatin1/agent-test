import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0BA6DF] to-[#FAA533]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center">
          <h1 className="text-4xl md:text-6xl font-bold text-white mb-6">
            Travel Reservation System
          </h1>
          <p className="text-xl md:text-2xl text-white/90 mb-12 max-w-3xl mx-auto">
            Book hotels, flights, and tours seamlessly with our modern reservation platform.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <Link 
              href="/hotels"
              className="bg-white/10 backdrop-blur-sm rounded-lg p-8 hover:bg-white/20 transition-all duration-300 transform hover:scale-105"
            >
              <div className="text-4xl mb-4">🏨</div>
              <h3 className="text-xl font-semibold text-white mb-2">Hotels</h3>
              <p className="text-white/80">Find and reserve the perfect accommodation for your stay</p>
            </Link>
            
            <Link 
              href="/flights"
              className="bg-white/10 backdrop-blur-sm rounded-lg p-8 hover:bg-white/20 transition-all duration-300 transform hover:scale-105"
            >
              <div className="text-4xl mb-4">✈️</div>
              <h3 className="text-xl font-semibold text-white mb-2">Flights</h3>
              <p className="text-white/80">Book your next flight adventure with ease</p>
            </Link>
            
            <Link 
              href="/tours"
              className="bg-white/10 backdrop-blur-sm rounded-lg p-8 hover:bg-white/20 transition-all duration-300 transform hover:scale-105"
            >
              <div className="text-4xl mb-4">🗺️</div>
              <h3 className="text-xl font-semibold text-white mb-2">Tours</h3>
              <p className="text-white/80">Discover amazing destinations with guided tours</p>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
