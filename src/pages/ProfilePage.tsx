{/* Default Sport Setting */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-slate-900">Default Sport</h3>
                <p className="text-sm text-slate-600">Choose which sport to show by default on dashboard</p>
              </div>
              <div className="flex items-center bg-slate-100 rounded-lg p-1">
                {(['rower', 'bike', 'skierg'] as SportType[]).map((sport) => (
                  <button
                    key={sport}
                    onClick={() => handleDefaultSportChange(sport)}
                    disabled={saving}
                    className={`px-3 py-1 rounded-md text-sm font-medium transition-colors duration-200 ${
                      profile?.default_sport === sport
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {SPORT_MAPPING[sport]}
                  </button>
                ))}
              </div>
            </div>